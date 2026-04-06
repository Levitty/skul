-- =====================================================
-- Transport Module Migration
-- =====================================================
-- Extends the basic transport_routes table with vehicles,
-- drivers, route stops, and student assignments.
-- =====================================================

-- =====================================================
-- 0. Create transport_routes table if not exists
-- =====================================================
CREATE TABLE IF NOT EXISTS transport_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    route_number TEXT,
    start_location TEXT,
    end_location TEXT,
    fee_amount NUMERIC(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_routes_school_id ON transport_routes(school_id);
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 1. Drivers table
-- =====================================================
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    license_number TEXT,
    license_expiry DATE,
    address TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. Vehicles table
-- =====================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    plate_number TEXT NOT NULL,
    vehicle_type TEXT DEFAULT 'bus' CHECK (vehicle_type IN ('bus', 'van', 'minibus', 'car', 'other')),
    make TEXT,
    model TEXT,
    year INTEGER,
    capacity INTEGER DEFAULT 30,
    color TEXT,
    insurance_number TEXT,
    insurance_expiry DATE,
    registration_expiry DATE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(school_id, plate_number)
);

-- =====================================================
-- 3. Route Stops table (stops along a route)
-- =====================================================
CREATE TABLE IF NOT EXISTS route_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    stop_name TEXT NOT NULL,
    stop_order INTEGER NOT NULL,
    pickup_time TIME,
    dropoff_time TIME,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    landmark TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(route_id, stop_order)
);

-- =====================================================
-- 4. Student Transport Assignments
-- =====================================================
CREATE TABLE IF NOT EXISTS student_transport (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES route_stops(id) ON DELETE SET NULL,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    transport_type TEXT DEFAULT 'both' CHECK (transport_type IN ('pickup', 'dropoff', 'both')),
    fee_amount NUMERIC(12, 2) DEFAULT 0,
    fee_paid NUMERIC(12, 2) DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'waived')),
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, route_id, academic_year_id, term_id)
);

-- =====================================================
-- 5. Add vehicle_id to transport_routes
-- =====================================================
ALTER TABLE transport_routes
ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS departure_time TIME,
ADD COLUMN IF NOT EXISTS return_time TIME,
ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS description TEXT;

-- =====================================================
-- 6. Create indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_drivers_school_id ON drivers(school_id);
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_school_id ON vehicles(school_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_student_transport_student_id ON student_transport(student_id);
CREATE INDEX IF NOT EXISTS idx_student_transport_route_id ON student_transport(route_id);
CREATE INDEX IF NOT EXISTS idx_student_transport_academic_year_id ON student_transport(academic_year_id);

-- =====================================================
-- 7. Enable RLS
-- =====================================================
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_transport ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. RLS Policies for drivers
-- =====================================================
CREATE POLICY "Users can view drivers in their school"
  ON drivers FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage drivers"
  ON drivers FOR ALL
  USING (school_id = get_user_school_id() 
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')));

-- =====================================================
-- 9. RLS Policies for vehicles
-- =====================================================
CREATE POLICY "Users can view vehicles in their school"
  ON vehicles FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage vehicles"
  ON vehicles FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')));

-- =====================================================
-- 10. RLS Policies for route_stops
-- =====================================================
CREATE POLICY "Users can view route stops in their school"
  ON route_stops FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM transport_routes tr 
    WHERE tr.id = route_stops.route_id 
    AND tr.school_id = get_user_school_id()
  ));

CREATE POLICY "Admins can manage route stops"
  ON route_stops FOR ALL
  USING (EXISTS (
    SELECT 1 FROM transport_routes tr 
    WHERE tr.id = route_stops.route_id 
    AND tr.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM transport_routes tr 
    WHERE tr.id = route_id 
    AND tr.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')));

-- =====================================================
-- 11. RLS Policies for student_transport
-- =====================================================
CREATE POLICY "Users can view student transport in their school"
  ON student_transport FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_transport.student_id 
    AND s.school_id = get_user_school_id()
  ));

CREATE POLICY "Admins can manage student transport"
  ON student_transport FOR ALL
  USING (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_transport.student_id 
    AND s.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager', 'accountant')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM students s 
    WHERE s.id = student_id 
    AND s.school_id = get_user_school_id()
  ) AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager', 'accountant')));

-- =====================================================
-- 12. Update transport_routes RLS to include transport_manager
-- =====================================================
DROP POLICY IF EXISTS "Users can view routes in their school" ON transport_routes;
DROP POLICY IF EXISTS "Admins can manage routes" ON transport_routes;

CREATE POLICY "Users can view routes in their school"
  ON transport_routes FOR SELECT
  USING (school_id = get_user_school_id());

CREATE POLICY "Admins can manage routes"
  ON transport_routes FOR ALL
  USING (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')))
  WITH CHECK (school_id = get_user_school_id()
    AND EXISTS (SELECT 1 FROM user_schools WHERE user_id = auth.uid() AND role IN ('super_admin', 'school_admin', 'transport_manager')));

