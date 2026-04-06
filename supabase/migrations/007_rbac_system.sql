-- RBAC System Migration
-- Custom roles with granular permissions

-- Custom Roles (per school)
CREATE TABLE IF NOT EXISTS custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, name)
);

-- Permissions (granular actions - global, not per school)
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource, action)
);

-- Role Permissions (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- Add custom_role_id to user_schools table
ALTER TABLE user_schools 
ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;

-- Seed default permissions
INSERT INTO permissions (resource, action, description) VALUES
    -- Students
    ('students', 'create', 'Create new students'),
    ('students', 'read', 'View student information'),
    ('students', 'update', 'Update student information'),
    ('students', 'delete', 'Delete/archive students'),
    ('students', 'export', 'Export student data'),
    ('students', 'promote', 'Promote students to next class'),
    ('students', 'transfer', 'Transfer students in/out'),
    ('students', 'suspend', 'Suspend students'),
    
    -- Admissions
    ('admissions', 'create', 'Create new applications'),
    ('admissions', 'read', 'View applications'),
    ('admissions', 'update', 'Update applications'),
    ('admissions', 'delete', 'Delete applications'),
    ('admissions', 'approve', 'Approve applications'),
    ('admissions', 'reject', 'Reject applications'),
    ('admissions', 'convert', 'Convert applications to students'),
    
    -- Fees
    ('fees', 'create', 'Create fee structures'),
    ('fees', 'read', 'View fees and invoices'),
    ('fees', 'update', 'Update fee structures'),
    ('fees', 'delete', 'Delete fee structures'),
    ('fees', 'generate_invoice', 'Generate invoices'),
    ('fees', 'record_payment', 'Record payments'),
    ('fees', 'view_reports', 'View financial reports'),
    
    -- Attendance
    ('attendance', 'create', 'Mark attendance'),
    ('attendance', 'read', 'View attendance records'),
    ('attendance', 'update', 'Update attendance records'),
    ('attendance', 'delete', 'Delete attendance records'),
    ('attendance', 'export', 'Export attendance data'),
    
    -- Grades
    ('grades', 'create', 'Enter grades'),
    ('grades', 'read', 'View grades'),
    ('grades', 'update', 'Update grades'),
    ('grades', 'delete', 'Delete grades'),
    ('grades', 'publish', 'Publish grades'),
    
    -- Timetable
    ('timetable', 'create', 'Create timetable entries'),
    ('timetable', 'read', 'View timetable'),
    ('timetable', 'update', 'Update timetable'),
    ('timetable', 'delete', 'Delete timetable entries'),
    ('timetable', 'publish', 'Publish timetable'),
    
    -- Financials
    ('financials', 'read', 'View financial reports'),
    ('financials', 'export', 'Export financial data'),
    
    -- Strategic
    ('strategic', 'read', 'View strategic analytics'),
    
    -- Settings
    ('settings', 'read', 'View settings'),
    ('settings', 'update', 'Update settings'),
    
    -- Users
    ('users', 'create', 'Create users'),
    ('users', 'read', 'View users'),
    ('users', 'update', 'Update users'),
    ('users', 'delete', 'Delete users'),
    ('users', 'assign_roles', 'Assign roles to users'),
    
    -- Roles
    ('roles', 'create', 'Create custom roles'),
    ('roles', 'read', 'View roles'),
    ('roles', 'update', 'Update roles'),
    ('roles', 'delete', 'Delete roles')
ON CONFLICT (resource, action) DO NOTHING;

-- Permission check function
CREATE OR REPLACE FUNCTION user_has_permission(
    p_resource TEXT,
    p_action TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN;
    v_user_role TEXT;
BEGIN
    -- First check system roles (backward compatibility)
    SELECT role INTO v_user_role
    FROM user_schools
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    -- Super admin and school admin have all permissions
    IF v_user_role IN ('super_admin', 'school_admin') THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user has permission through their custom role
    SELECT EXISTS (
        SELECT 1
        FROM user_schools us
        JOIN custom_roles cr ON cr.id = us.custom_role_id
        JOIN role_permissions rp ON rp.role_id = cr.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE us.user_id = auth.uid()
          AND p.resource = p_resource
          AND p.action = p_action
    ) INTO v_has_permission;
    
    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all permissions for current user
CREATE OR REPLACE FUNCTION get_user_permissions()
RETURNS TABLE (resource TEXT, action TEXT) AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    -- Get user's system role
    SELECT role INTO v_user_role
    FROM user_schools
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    -- Super admin and school admin have all permissions
    IF v_user_role IN ('super_admin', 'school_admin') THEN
        RETURN QUERY SELECT p.resource, p.action FROM permissions p;
        RETURN;
    END IF;
    
    -- Return permissions from custom role
    RETURN QUERY
    SELECT p.resource, p.action
    FROM user_schools us
    JOIN custom_roles cr ON cr.id = us.custom_role_id
    JOIN role_permissions rp ON rp.role_id = cr.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE us.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_roles_school_id ON custom_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_schools_custom_role_id ON user_schools(custom_role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- Enable RLS on new tables
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_roles
CREATE POLICY "Users can view roles of their school"
  ON custom_roles FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage roles of their school"
  ON custom_roles FOR ALL
  USING (
    school_id = get_user_school_id()
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- RLS Policies for role_permissions
CREATE POLICY "Users can view role permissions of their school roles"
  ON role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_roles cr
      WHERE cr.id = role_permissions.role_id
      AND cr.school_id = get_user_school_id()
    )
  );

CREATE POLICY "Admins can manage role permissions of their school"
  ON role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM custom_roles cr
      WHERE cr.id = role_permissions.role_id
      AND cr.school_id = get_user_school_id()
    )
    AND (user_has_role('school_admin') OR user_has_role('super_admin'))
  );

-- Permissions table is read-only for all (system-defined)
CREATE POLICY "Anyone can read permissions"
  ON permissions FOR SELECT
  USING (true);



