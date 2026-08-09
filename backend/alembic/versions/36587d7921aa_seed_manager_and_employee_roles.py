"""seed manager and employee roles

Revision ID: 36587d7921aa
Revises: 31bbd484da54
Create Date: 2026-08-10 00:51:42.207334

"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "36587d7921aa"
down_revision: Union[str, Sequence[str], None] = "31bbd484da54"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Lightweight table handles for data-only migration — kept independent of the
# ORM models in api/db/models.py so future model changes can't alter history.
roles_table = sa.table(
    "roles", sa.column("id", UUID), sa.column("name"), sa.column("description")
)
permissions_table = sa.table(
    "permissions", sa.column("id", UUID), sa.column("code"), sa.column("description")
)
role_permissions_table = sa.table(
    "role_permissions", sa.column("role_id", UUID), sa.column("permission_id", UUID)
)

RESOURCES = ["people", "projects", "teams", "roles", "skills", "assignments"]
CATALOG_READ_PERMISSIONS = [f"{resource}:read" for resource in RESOURCES]

PERMISSIONS = [
    *[
        f"{resource}:{action}"
        for resource in RESOURCES
        for action in ("read", "write", "delete")
    ],
    "optimization:run",
    "users:manage_roles",
]

# Employee: read access to catalog data, plus write on their own Person/availability.
EMPLOYEE_PERMISSIONS = [*CATALOG_READ_PERMISSIONS, "people:write"]


def upgrade() -> None:
    """Upgrade schema."""
    permission_ids = {code: uuid.uuid4() for code in PERMISSIONS}
    op.bulk_insert(
        permissions_table,
        [
            {"id": permission_ids[code], "code": code, "description": ""}
            for code in PERMISSIONS
        ],
    )

    manager_id = uuid.uuid4()
    employee_id = uuid.uuid4()
    op.bulk_insert(
        roles_table,
        [
            {
                "id": manager_id,
                "name": "manager",
                "description": "Full access to all resources.",
            },
            {
                "id": employee_id,
                "name": "employee",
                "description": "Read-only on catalog data, write scoped to their own person record.",
            },
        ],
    )

    op.bulk_insert(
        role_permissions_table,
        [
            {"role_id": manager_id, "permission_id": permission_ids[code]}
            for code in PERMISSIONS
        ]
        + [
            {"role_id": employee_id, "permission_id": permission_ids[code]}
            for code in EMPLOYEE_PERMISSIONS
        ],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(role_permissions_table.delete())
    op.execute(
        roles_table.delete().where(roles_table.c.name.in_(["manager", "employee"]))
    )
    op.execute(
        permissions_table.delete().where(permissions_table.c.code.in_(PERMISSIONS))
    )
