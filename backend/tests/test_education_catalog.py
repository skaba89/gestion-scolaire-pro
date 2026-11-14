"""Profile choices must preserve core access and never invent unavailable features."""
import pytest

from app.core.education_catalog import InvalidModuleConfiguration, proposed_profile, resolve_modules
from app.schemas.tenants import TenantCreate, TenantWithAdminCreate
from app.api.v1.endpoints.core.auth import RegisterSchoolRequest
from app.core.guinea_presets import guinea_levels_for_type


PROFILES = ["preschool", "primary", "middle", "high", "university", "higher_education", "training", "vocational", "mixed"]


@pytest.mark.parametrize("profile", PROFILES)
def test_all_creation_entry_points_accept_the_same_nine_profiles(profile):
    assert TenantCreate(name="École", slug="ecole-test", type=profile).type == profile
    assert TenantWithAdminCreate(name="École", slug="ecole-test", type=profile,
                                 admin_email="admin@example.gn", admin_first_name="A", admin_last_name="B").type == profile
    assert RegisterSchoolRequest(school_name="École", school_type=profile, first_name="A", last_name="B",
                                 email="admin@example.gn", password="not-a-real-password").school_type == profile


def test_university_can_use_lmd_while_primary_requires_an_explicit_choice():
    assert "lmd" in resolve_modules("university")
    assert "lmd" not in resolve_modules("primary")
    assert "lmd" in resolve_modules("primary", {"lmd": True})


def test_preschool_does_not_pretend_numeric_or_competency_assessment_exists_by_default():
    modules = resolve_modules("preschool")
    assert "academics" in modules and "attendance" in modules
    assert "assessments" not in modules and "competencies" not in modules
    with pytest.raises(InvalidModuleConfiguration, match="non disponible"):
        resolve_modules("preschool", {"competencies": True})


@pytest.mark.parametrize("module", ["authentication", "users", "institutions", "security", "finance", "notifications", "audit", "reporting"])
def test_common_core_cannot_be_disabled(module):
    with pytest.raises(InvalidModuleConfiguration, match="socle commun"):
        resolve_modules("mixed", {module: False})


def test_lmd_cannot_bypass_its_assessment_dependency():
    with pytest.raises(InvalidModuleConfiguration, match="lmd nécessite"):
        resolve_modules("university", {"assessments": False})
    assert "lmd" not in resolve_modules("university", {"assessments": False, "lmd": False})


@pytest.mark.parametrize("overrides", [{"unknown": True}, {"library": "false"}, {"library": 0}])
def test_invalid_overrides_are_refused_without_coercion(overrides):
    with pytest.raises(InvalidModuleConfiguration):
        resolve_modules("primary", overrides)


def test_legacy_type_is_only_a_proposal_and_unknown_profiles_are_refused():
    assert proposed_profile("IUT") == "higher_education"
    assert proposed_profile("school") == "mixed"
    with pytest.raises(InvalidModuleConfiguration):
        resolve_modules("school")


def test_mixed_institution_does_not_invent_levels_and_presets_cannot_be_mutated_by_callers():
    assert guinea_levels_for_type("mixed") == []
    assert guinea_levels_for_type("preschool") == ["Petite section", "Moyenne section", "Grande section"]
    levels = guinea_levels_for_type("primary")
    levels.clear()
    assert guinea_levels_for_type("primary") == ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"]
