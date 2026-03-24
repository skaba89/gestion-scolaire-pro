/**
 * SHIM DE TRANSITION SOUVERAINE
 *
 * Ce fichier reste temporairement présent pour éviter de casser le build tant que
 * tous les appels hérités n'ont pas été réécrits vers l'API souveraine.
 *
 * Objectifs de cette version :
 * - éviter le bruit console permanent en production ;
 * - journaliser uniquement en mode debug explicite ;
 * - rester sûre et non bloquante pour les appels hérités encore résiduels.
 */

const LEGACY_SHIM_DEBUG = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LEGACY_SHIM_DEBUG === "true";
const warnedMessages = new Set<string>();

function legacyShimDebug(...args: unknown[]) {
  if (LEGACY_SHIM_DEBUG) {
    console.warn("[SOVEREIGN MIGRATION]", ...args);
  }
}

function warnOnce(message: string) {
  if (warnedMessages.has(message)) {
    return;
  }

  warnedMessages.add(message);
  legacyShimDebug(message);
}

const createDummyQuery = (table: string | null = null) => {
  const dummyPromise = Promise.resolve({ data: [] as unknown[], error: null, count: 0 });
  const responder: any = function () {};

  responder.single = () => Promise.resolve({ data: null, error: null });
  responder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  responder.csv = () => Promise.resolve({ data: "", error: null });

  responder.then = (onfulfilled?: any, onrejected?: any) => dummyPromise.then(onfulfilled, onrejected);
  responder.catch = (onrejected?: any) => dummyPromise.catch(onrejected);
  responder.finally = (onfinally?: any) => dummyPromise.finally(onfinally);

  const proxy: any = new Proxy(responder, {
    get(target, prop, receiver) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }

      return proxy;
    },
    apply() {
      return proxy;
    },
  });

  if (table) {
    warnOnce(`Chaînage hérité Supabase détecté sur la table "${table}".`);
  }

  return proxy;
};

const supabaseBase = {
  from: (table: string) => {
    warnOnce(`Appel hérité à Supabase sur la table "${table}".`);
    return createDummyQuery(table);
  },
  rpc: (name: string, params?: unknown) => {
    void params;
    warnOnce(`Appel hérité à Supabase RPC "${name}".`);
    return createDummyQuery();
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signInWithOtp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: () =>
        Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      listFactors: () => Promise.resolve({ data: { all: [] }, error: null }),
    },
  },
  storage: {
    from: (bucket: string) => {
      warnOnce(`Appel hérité à Supabase Storage sur le bucket "${bucket}".`);
      return {
        upload: () => Promise.resolve({ data: null, error: new Error("Storage disabled") }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
        download: () => Promise.resolve({ data: null, error: new Error("Storage disabled") }),
      };
    },
  },
  channel: (name: string) => {
    warnOnce(`Appel hérité à Realtime sur le channel "${name}".`);
    const channelObj = {
      on: (_event: string, _filter: unknown, _callback: unknown) => channelObj,
      subscribe: () => ({ unsubscribe: () => undefined }),
    };
    return channelObj;
  },
  removeChannel: (_channel: unknown) => Promise.resolve(),
  functions: {
    invoke: () => Promise.resolve({ data: null, error: new Error("Functions disabled") }),
  },
} as any;

export const isLegacySupabaseShim = true;

export const supabase = new Proxy(supabaseBase, {
  get(target, prop, receiver) {
    if (prop in target) {
      return target[prop];
    }
    if (typeof prop === "symbol") {
      return Reflect.get(target, prop, receiver);
    }

    warnOnce(`Propriété Supabase non migrée accédée: ${String(prop)}`);
    return () => createDummyQuery();
  },
});
