"""One-off CLI to promote an already-registered user to the manager role.

`POST /api/v1/auth/users/{id}/roles` requires an existing manager caller, so
it can't grant the very first manager account — this script grants the role
directly in Postgres instead. Run once per environment, then use the API for
any promotion after that.

Usage:
    uv run python scripts/bootstrap_manager.py <email>
"""

import sys

from api.db.models import Role, User
from api.db.session import SessionLocal


def main(email: str) -> None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            raise SystemExit(f"No user found with email {email!r} — register it first")

        manager_role = db.query(Role).filter(Role.name == "manager").first()
        if manager_role is None:
            raise SystemExit("manager role not seeded — run alembic migrations first")

        if manager_role not in user.roles:
            user.roles.append(manager_role)
            db.commit()

        print(f"{email} is now a manager")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: bootstrap_manager.py <email>")
    main(sys.argv[1])
