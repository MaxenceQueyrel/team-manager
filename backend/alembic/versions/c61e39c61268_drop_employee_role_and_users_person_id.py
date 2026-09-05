"""drop employee role and users person_id

Revision ID: c61e39c61268
Revises: 36587d7921aa
Create Date: 2026-09-05 14:01:06.732802

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c61e39c61268'
down_revision: Union[str, Sequence[str], None] = '36587d7921aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Lightweight table handles for data-only migration — kept independent of the
# ORM models in api/db/models.py so future model changes can't alter history.
roles_table = sa.table(
    "roles", sa.column("id", UUID), sa.column("name"), sa.column("description")
)
permissions_table = sa.table(
    "permissions", sa.column("id", UUID), sa.column("code")
)
role_permissions_table = sa.table(
    "role_permissions", sa.column("role_id", UUID), sa.column("permission_id", UUID)
)
user_roles_table = sa.table(
    "user_roles", sa.column("user_id", UUID), sa.column("role_id", UUID)
)

# Mirrors the EMPLOYEE_PERMISSIONS set from 36587d7921aa, needed to restore
# the role's permission links on downgrade.
RESOURCES = ["people", "projects", "teams", "roles", "skills", "assignments"]
EMPLOYEE_PERMISSIONS = [f"{resource}:read" for resource in RESOURCES] + ["people:write"]


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    role_ids = dict(
        bind.execute(
            sa.select(roles_table.c.name, roles_table.c.id).where(
                roles_table.c.name.in_(["manager", "employee"])
            )
        ).all()
    )
    manager_id = role_ids["manager"]
    employee_id = role_ids["employee"]

    # Every existing employee-only account becomes a manager — the app no
    # longer creates or supports non-manager accounts.
    already_manager = {
        user_id
        for (user_id,) in bind.execute(
            sa.select(user_roles_table.c.user_id).where(
                user_roles_table.c.role_id == manager_id
            )
        )
    }
    employee_user_ids = [
        user_id
        for (user_id,) in bind.execute(
            sa.select(user_roles_table.c.user_id).where(
                user_roles_table.c.role_id == employee_id
            )
        )
    ]
    op.bulk_insert(
        user_roles_table,
        [
            {"user_id": user_id, "role_id": manager_id}
            for user_id in employee_user_ids
            if user_id not in already_manager
        ],
    )

    op.execute(
        user_roles_table.delete().where(user_roles_table.c.role_id == employee_id)
    )
    op.execute(
        role_permissions_table.delete().where(
            role_permissions_table.c.role_id == employee_id
        )
    )
    op.execute(roles_table.delete().where(roles_table.c.id == employee_id))

    op.drop_column("users", "person_id")


def downgrade() -> None:
    """Downgrade schema.

    Restores the `employee` role/permissions and the `users.person_id`
    column, but does not attempt to demote the accounts upgrade() promoted
    from employee to manager — which former role each of them held isn't
    recoverable at this point.
    """
    op.add_column("users", sa.Column("person_id", sa.String(), nullable=True))

    employee_id = uuid.uuid4()
    op.bulk_insert(
        roles_table,
        [
            {
                "id": employee_id,
                "name": "employee",
                "description": "Read-only on catalog data, write scoped to their own person record.",
            }
        ],
    )

    bind = op.get_bind()
    permission_ids = {
        code: id_
        for id_, code in bind.execute(
            sa.select(permissions_table.c.id, permissions_table.c.code).where(
                permissions_table.c.code.in_(EMPLOYEE_PERMISSIONS)
            )
        )
    }
    op.bulk_insert(
        role_permissions_table,
        [
            {"role_id": employee_id, "permission_id": permission_ids[code]}
            for code in EMPLOYEE_PERMISSIONS
        ],
    )
