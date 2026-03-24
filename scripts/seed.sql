-- Seed default admin user (idempotent)
-- Default credentials: admin@getpostbase.com / postbase
-- User is required to change password on first login.
INSERT INTO _postbase.admin_users (email, password_hash, must_change_credentials)
VALUES (
    'admin@getpostbase.com',
    '$2a$12$aB.LDM/6j6NQw.a7sVT56egjs6xnxUbHHCiuGWzSfvTJBtLfTgpXG',
    true
)
ON CONFLICT (email) DO NOTHING;
