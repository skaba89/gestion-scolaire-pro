#!/usr/bin/env bash
# Exercice de restauration de la production depuis Backblaze B2 (P0-3 / OPS-01).
#
# Démontre, sans JAMAIS toucher la base de production, que le dump nocturne
# réellement produit par le VPS (service db-backup → pg_dump public en SQL
# compressé, copié chiffré par rclone sur B2) se restaure et redonne une base
# exploitable sous RLS. Mesure RPO et RTO technique. Produit un rapport.
#
# Restauration dans un conteneur PostgreSQL JETABLE : sans réseau (--network
# none), sans port publié, supprimé à la fin. La production n'est lue qu'en
# lecture seule (comptages de comparaison), et seulement si --comparer-prod.
#
# Usage (sur le VPS, root, depuis n'importe quel dossier) :
#   sudo deploy/vps/scripts/exercice-restauration.sh                 # dernier dump distant
#   sudo deploy/vps/scripts/exercice-restauration.sh --date 20261102
#   sudo deploy/vps/scripts/exercice-restauration.sh --source local  # infra/backups/daily (sans B2)
#   sudo deploy/vps/scripts/exercice-restauration.sh --comparer-prod # + écarts avec la prod
#
# Prérequis : remote rclone « distant-crypt » (configurer-sauvegarde-b2.sh),
# docker. Aucun secret n'est lu, affiché ni passé en argument par ce script.
#
# Sortie : rapport Markdown dans /var/log/schoolflow-restore-drill/ (aucune
# donnée personnelle : uniquement des comptages et des noms de tables).
# Code retour : 0 si tous les contrôles passent, 1 sinon.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
SOURCE="b2"
DUMP_DATE=""
COMPARE_PROD=0
PG_IMAGE="${RESTORE_DRILL_PG_IMAGE:-postgres:16-alpine}"
REPORT_DIR="${RESTORE_DRILL_REPORT_DIR:-/var/log/schoolflow-restore-drill}"

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --date) DUMP_DATE="$2"; shift 2 ;;
    --comparer-prod) COMPARE_PROD=1; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done
case "$SOURCE" in b2|local) ;; *) echo "--source b2|local" >&2; exit 2 ;; esac
if [ -n "$DUMP_DATE" ] && ! [[ "$DUMP_DATE" =~ ^[0-9]{8}$ ]]; then
  echo "--date attend AAAAMMJJ" >&2; exit 2
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d /tmp/schoolflow-restore-drill.XXXXXX)"
CONTAINER="schoolflow-restore-drill-$STAMP"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/exercice-$STAMP.md"
FAILURES=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
# Arrêt inattendu : le rapport le dit explicitement (jamais de rapport tronqué
# qui pourrait passer pour un succès).
trap 'report ""; report "**INTERROMPU** — erreur inattendue ligne $LINENO : la restauration n'"'"'est PAS démontrée."' ERR

now() { date +%s; }
log() { echo "[$(date +%H:%M:%S)] $*"; }
report() { printf '%s\n' "$*" >>"$REPORT"; }
check() { # check <libellé> <ok|ko> <détail>
  local mark="✅"
  if [ "$2" != "ok" ]; then mark="❌"; FAILURES=$((FAILURES + 1)); fi
  report "| $1 | $mark | $3 |"
  log "$mark $1 — $3"
}
# SQL dans la base JETABLE (superutilisateur du conteneur).
drill_sql() { docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U schoolflow -d schoolflow -At "$@"; }
# SQL dans la base jetable SOUS LE RÔLE RESTREINT (RLS appliquée).
app_sql() { docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U schoolflow_app -d schoolflow -At "$@"; }
# Lecture seule de la production (comparaison uniquement).
prod_sql() {
  docker compose --project-directory "$REPO" --env-file "$REPO/.env.docker" \
    -f "$REPO/docker-compose.yml" -f "$REPO/deploy/vps/docker-compose.vps.yml" \
    exec -T -e PGOPTIONS="-c default_transaction_read_only=on" postgres \
    psql -X -v ON_ERROR_STOP=1 -U schoolflow -d schoolflow -At "$@"
}

T_START=$(now)
report "# Exercice de restauration — $(date -Is)"
report ""
report "- Hôte : \`$(hostname)\` · dépôt : \`$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?')\`"
report "- Source : **$SOURCE** · image : \`$PG_IMAGE\` · base de production : **non modifiée** (lecture seule : $([ $COMPARE_PROD -eq 1 ] && echo oui || echo non))"
report ""

# ── 1. Récupération du dump ───────────────────────────────────────────────
log "1/6 Récupération du dump ($SOURCE)"
T0=$(now)
if [ "$SOURCE" = "b2" ]; then
  rclone listremotes 2>/dev/null | grep -qx "distant-crypt:" \
    || { echo "Remote rclone « distant-crypt » absent : lancer configurer-sauvegarde-b2.sh" >&2; exit 1; }
  if [ -n "$DUMP_DATE" ]; then
    FILE="$(rclone lsf distant-crypt:daily --files-only | grep -F -- "$DUMP_DATE" | grep -v latest | sort | tail -n 1)"
  else
    FILE="$(rclone lsf distant-crypt:daily --files-only | grep -v latest | sort | tail -n 1)"
  fi
  [ -n "$FILE" ] || { echo "Aucun dump distant trouvé" >&2; exit 1; }
  rclone copyto "distant-crypt:daily/$FILE" "$WORK/$FILE"
  # Date du dump = horodatage de l'objet distant (RPO).
  DUMP_EPOCH="$(date -d "$(rclone lsl "distant-crypt:daily/$FILE" | awk '{print $2" "substr($3,1,8)}')" +%s)"
else
  SRC_DIR="${RESTORE_DRILL_LOCAL_DIR:-$REPO/infra/backups/daily}"
  FILE="$(find "$SRC_DIR" -maxdepth 1 \( -type f -o -type l \) -name "*${DUMP_DATE}*.sql.gz" ! -name "*latest*" -printf '%f\n' | sort | tail -n 1)"
  [ -n "$FILE" ] || { echo "Aucun dump local trouvé dans $SRC_DIR" >&2; exit 1; }
  cp --dereference "$SRC_DIR/$FILE" "$WORK/$FILE"
  DUMP_EPOCH="$(stat -c %Y "$SRC_DIR/$FILE")"
fi
T_FETCH=$(( $(now) - T0 ))
SIZE="$(du -h "$WORK/$FILE" | cut -f1)"
SHA="$(sha256sum "$WORK/$FILE" | cut -c1-16)"
RPO_H=$(( ( $(now) - DUMP_EPOCH ) / 3600 ))

report "## Contrôles"
report ""
report "| Contrôle | Résultat | Détail |"
report "|---|---|---|"
check "Récupération ($([ "$SOURCE" = b2 ] && echo "B2, déchiffrement rclone" || echo "copie locale, sans B2"))" ok "\`$FILE\` · $SIZE · sha256 \`$SHA…\` · ${T_FETCH}s"

# ── 2. Intégrité de l'archive ─────────────────────────────────────────────
log "2/6 Intégrité gzip"
if gzip -t "$WORK/$FILE" 2>/dev/null; then
  check "Archive gzip intègre" ok "gzip -t"
else
  check "Archive gzip intègre" ko "archive corrompue"
  report ""; report "**ÉCHEC** — archive corrompue : la restauration n'est pas démontrée. Essayer le dump de la veille (--date)."
  trap - ERR; exit 1
fi

# ── 3. Base jetable isolée ────────────────────────────────────────────────
log "3/6 Conteneur PostgreSQL jetable (sans réseau)"
# trust : le conteneur n'a AUCUN réseau, il n'est joignable que par docker exec.
docker run -d --rm --name "$CONTAINER" --network none \
  -e POSTGRES_USER=schoolflow -e POSTGRES_DB=schoolflow -e POSTGRES_HOST_AUTH_METHOD=trust \
  "$PG_IMAGE" >/dev/null
# L'image démarre d'abord un serveur temporaire d'initialisation, puis
# redémarre : pg_isready seul répond « prêt » trop tôt.
READY=0
for _ in $(seq 1 120); do
  if docker logs "$CONTAINER" 2>&1 | grep -q "init process complete" \
     && docker exec "$CONTAINER" pg_isready -U schoolflow -d schoolflow >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 1
done
[ "$READY" -eq 1 ] || { echo "PostgreSQL jetable non prêt après 120 s" >&2; exit 1; }
# pg_dump ne contient pas les rôles : on recrée le rôle runtime tel qu'en
# production (docs/POSTGRES_APP_ROLE.md) — NOBYPASSRLS, non superutilisateur —
# AVANT la restauration, pour que ses droits (GRANT du dump) s'appliquent.
drill_sql -c "CREATE ROLE schoolflow_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;" >/dev/null
# Le dump (pg_dump --schema=public) recrée le schéma public : la base cible
# doit partir vide, sans lui — comme une base de secours neuve.
drill_sql -c "DROP SCHEMA public CASCADE;" >/dev/null
# Autres rôles cités par le dump (GRANT … TO x, OWNER TO x) : recréés SANS
# aucun privilège, uniquement pour que la restauration stricte aboutisse.
EXTRA_ROLES="$(zcat "$WORK/$FILE" | grep -oE '(OWNER TO|TO) "?[a-z_][a-z0-9_]*"?;' | grep -oE '[a-z_][a-z0-9_]*"?;$' | tr -d '";' | sort -u \
  | grep -vxE 'schoolflow|schoolflow_app|public|postgres|pg_[a-z_]*' || true)"
for r in $EXTRA_ROLES; do
  [[ "$r" =~ ^[a-z_][a-z0-9_]*$ ]] || continue
  drill_sql -c "CREATE ROLE \"$r\" NOLOGIN NOSUPERUSER NOBYPASSRLS;" >/dev/null
done

# ── 4. Restauration ───────────────────────────────────────────────────────
log "4/6 Restauration"
T0=$(now)
if zcat "$WORK/$FILE" | drill_sql -q >"$WORK/restore.log" 2>&1; then
  T_RESTORE=$(( $(now) - T0 ))
  check "Restauration psql (ON_ERROR_STOP)" ok "${T_RESTORE}s, aucune erreur$([ -n "$EXTRA_ROLES" ] && echo " · rôles recréés sans privilège : $(echo $EXTRA_ROLES | tr ' ' ',')")"
else
  T_RESTORE=$(( $(now) - T0 ))
  check "Restauration psql (ON_ERROR_STOP)" ko "échec après ${T_RESTORE}s : $(grep -m1 -i error "$WORK/restore.log" | cut -c1-160)"
fi

# ── 5. Contrôles de la base restaurée ─────────────────────────────────────
log "5/6 Contrôles"
T0=$(now)
REV="$(drill_sql -c "SELECT string_agg(version_num, ',') FROM alembic_version;" 2>/dev/null || true)"
REV_ROWS="$(drill_sql -c "SELECT count(*) FROM alembic_version;" 2>/dev/null || echo 0)"
if [ "$REV_ROWS" = "1" ]; then check "Révision Alembic" ok "\`$REV\`"; else check "Révision Alembic" ko "$REV_ROWS ligne(s) : \`$REV\`"; fi

TABLES="$(drill_sql -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")"
RLS_FORCED="$(drill_sql -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;")"
POLICIES="$(drill_sql -c "SELECT count(*) FROM pg_policies WHERE schemaname='public';")"
TENANT_TABLES="$(drill_sql -c "SELECT count(DISTINCT table_name) FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id';")"
NO_RLS="$(drill_sql -c "SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN information_schema.columns col ON col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id' WHERE n.nspname='public' AND c.relkind='r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);")"
check "Tables restaurées" "$([ "${TABLES:-0}" -gt 0 ] && echo ok || echo ko)" "$TABLES tables, $POLICIES politiques RLS"
if [ "${TENANT_TABLES:-0}" -eq 0 ]; then
  check "RLS ENABLE+FORCE sur toutes les tables tenant" ko "aucune table avec tenant_id : rien à contrôler"
elif [ -z "$NO_RLS" ]; then
  check "RLS ENABLE+FORCE sur toutes les tables tenant" ok "$RLS_FORCED tables forcées / $TENANT_TABLES avec tenant_id"
else
  check "RLS ENABLE+FORCE sur toutes les tables tenant" ko "sans RLS forcée : $NO_RLS"
fi

# Volumes : comptages seulement (aucune donnée personnelle dans le rapport).
MAIN_TABLES="tenants users students parents teachers classrooms enrollments grades attendance invoices payments audit_logs"
COUNTS=""
for t in $MAIN_TABLES; do
  if [ "$(drill_sql -c "SELECT to_regclass('public.$t') IS NOT NULL;")" = "t" ]; then
    COUNTS="$COUNTS $t=$(drill_sql -c "SELECT count(*) FROM public.\"$t\";")"
  fi
done
STUDENTS="$(drill_sql -c "SELECT count(*) FROM students;" 2>/dev/null || echo 0)"
TENANTS="$(drill_sql -c "SELECT count(*) FROM tenants;" 2>/dev/null || echo 0)"
check "Données présentes" "$([ "${TENANTS:-0}" -gt 0 ] && echo ok || echo ko)" "$(echo "$COUNTS" | sed 's/^ //; s/ / · /g')"

# Relations : enregistrements orphelins (doivent être 0).
ORPHANS="$(drill_sql -c "
  SELECT (SELECT count(*) FROM students s LEFT JOIN tenants t ON t.id=s.tenant_id WHERE t.id IS NULL)
       + (SELECT count(*) FROM invoices i LEFT JOIN students s ON s.id=i.student_id WHERE i.student_id IS NOT NULL AND s.id IS NULL)
       + (SELECT count(*) FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id WHERE p.invoice_id IS NOT NULL AND i.id IS NULL)
       + (SELECT count(*) FROM payments p LEFT JOIN tenants t ON t.id=p.tenant_id WHERE t.id IS NULL);" 2>/dev/null || echo "?")"
check "Relations (élèves, factures, paiements orphelins)" "$([ "$ORPHANS" = "0" ] && echo ok || echo ko)" "$ORPHANS orphelin(s)"

# Cohérence financière : paid_amount = somme des paiements COMPLETED (FIN-01).
FIN_GAPS="$(drill_sql -c "
  SELECT count(*) FROM invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) s FROM payments WHERE status='COMPLETED' GROUP BY invoice_id) p ON p.invoice_id=i.id
  WHERE abs(COALESCE(i.paid_amount,0) - COALESCE(p.s,0)) > 0.01;" 2>/dev/null || echo "?")"
if [ "$FIN_GAPS" = "0" ]; then
  check "Factures : montant payé = somme des paiements encaissés" ok "0 écart"
else
  # Constat, pas un échec de restauration : signale des écarts déjà présents en production.
  report "| Factures : montant payé = somme des paiements encaissés | ⚠️ | $FIN_GAPS facture(s) en écart (constat sur les données, à analyser — voir FIN-01) |"
  log "⚠️ $FIN_GAPS facture(s) en écart de montant payé"
fi

# Rôle restreint : RLS appliquée (fail-closed sans contexte, cloisonnée avec).
NO_CTX="$(app_sql -c "SELECT count(*) FROM students;" 2>&1 || true)"
if [ "$NO_CTX" = "0" ]; then
  check "Rôle restreint sans contexte tenant" ok "0 élève visible (fail-closed)"
else
  check "Rôle restreint sans contexte tenant" ko "résultat : $(echo "$NO_CTX" | head -1 | cut -c1-120)"
fi
TID="$(drill_sql -c "SELECT tenant_id FROM students GROUP BY tenant_id ORDER BY count(*) DESC LIMIT 1;" 2>/dev/null || true)"
if [[ "$TID" =~ ^[0-9a-f-]{36}$ ]]; then
  EXPECTED="$(drill_sql -c "SELECT count(*) FROM students WHERE tenant_id='$TID';")"
  # $TID est validé (UUID) ci-dessus. Contexte de session, comme get_db.
  SEEN="$(app_sql -q -c "SELECT set_config('app.current_tenant_id', '$TID', false);" \
      -c "SELECT count(*) FROM students;" -c "SELECT count(*) FROM students WHERE tenant_id <> '$TID';" 2>&1 | sed -n '2,3p' | paste -sd' ' || true)"
  if [ "$SEEN" = "$EXPECTED 0" ]; then
    check "Rôle restreint avec contexte d'un établissement" ok "voit ses $EXPECTED élèves, 0 d'un autre établissement"
  else
    check "Rôle restreint avec contexte d'un établissement" ko "attendu « $EXPECTED 0 », obtenu « $SEEN »"
  fi
elif [ "$(drill_sql -c "SELECT to_regclass('public.students') IS NOT NULL;")" = "t" ]; then
  report "| Rôle restreint avec contexte d'un établissement | — | aucun élève dans le dump : non testable |"
else
  check "Rôle restreint avec contexte d'un établissement" ko "table students absente"
fi
T_CHECKS=$(( $(now) - T0 ))

# ── 6. Comparaison avec la production (lecture seule, facultatif) ─────────
if [ "$COMPARE_PROD" -eq 1 ]; then
  log "6/6 Comparaison avec la production (lecture seule)"
  PROD_REV="$(prod_sql -c "SELECT string_agg(version_num, ',') FROM alembic_version;" 2>/dev/null || echo '?')"
  PROD_STUDENTS="$(prod_sql -c "SELECT count(*) FROM students;" 2>/dev/null || echo '?')"
  PROD_RLS="$(prod_sql -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;" 2>/dev/null || echo '?')"
  check "Même révision que la production" "$([ "$PROD_REV" = "$REV" ] && echo ok || echo ko)" "prod \`$PROD_REV\` · dump \`$REV\` (écart = migration postérieure au dump)"
  check "Même nombre de tables RLS forcées" "$([ "$PROD_RLS" = "$RLS_FORCED" ] && echo ok || echo ko)" "prod $PROD_RLS · dump $RLS_FORCED"
  report "| Élèves (prod / dump) | ℹ️ | $PROD_STUDENTS / $STUDENTS — l'écart correspond aux saisies depuis le dump (RPO) |"
else
  log "6/6 Comparaison avec la production : non demandée (--comparer-prod)"
fi

T_TOTAL=$(( $(now) - T_START ))
report ""
report "## Mesures"
report ""
report "| Mesure | Valeur |"
report "|---|---|"
report "| **RPO** (âge du dump restauré) | **${RPO_H} h** — dump quotidien : RPO maximal ≈ 24 h + délai de copie distante (03:00) |"
report "| Téléchargement + déchiffrement | ${T_FETCH} s |"
report "| Restauration | ${T_RESTORE} s |"
report "| Contrôles | ${T_CHECKS} s |"
report "| **RTO technique mesuré** | **${T_TOTAL} s** (hors décision humaine, reconfiguration rclone sur une machine neuve et redéploiement applicatif) |"
report ""
report "## Verdict"
report ""
if [ "$FAILURES" -eq 0 ]; then
  report "**RÉUSSI** — le dump de production se restaure et la base restaurée applique la RLS sous le rôle runtime."
else
  report "**ÉCHEC** — $FAILURES contrôle(s) en échec : la restauration n'est pas démontrée."
fi
report ""
report "_Conteneur et fichiers temporaires supprimés à la fin de l'exercice. Rapport sans donnée personnelle._"

trap - ERR
log "Rapport : $REPORT"
cat "$REPORT"
if [ "$FAILURES" -eq 0 ]; then exit 0; else exit 1; fi
