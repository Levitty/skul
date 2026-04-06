"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/supabase/tenant-context"
import { revalidatePath } from "next/cache"

// ============ Routes Actions ============

export async function getRoutes() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: routes, error } = await adminClient
    .from("transport_routes")
    .select(`
      *,
      vehicle:vehicles(id, plate_number, vehicle_type, capacity),
      driver:drivers(id, name, phone),
      stops:route_stops(id, stop_name, stop_order, pickup_time, dropoff_time)
    `)
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: routes }
}

export async function getRoute(routeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: route, error } = await adminClient
    .from("transport_routes")
    .select(`
      *,
      vehicle:vehicles(id, plate_number, vehicle_type, capacity),
      driver:drivers(id, name, phone),
      stops:route_stops(id, stop_name, stop_order, pickup_time, dropoff_time, landmark)
    `)
    .eq("id", routeId)
    .eq("school_id", context.schoolId)
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data: route }
}

export async function createRoute(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const routeNumber = formData.get("route_number") as string
  const startLocation = formData.get("start_location") as string
  const endLocation = formData.get("end_location") as string
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const vehicleId = formData.get("vehicle_id") as string || null
  const driverId = formData.get("driver_id") as string || null
  const departureTime = formData.get("departure_time") as string || null
  const returnTime = formData.get("return_time") as string || null
  const description = formData.get("description") as string || null

  if (!name) {
    return { error: "Route name is required" }
  }

  const { data: route, error } = await adminClient
    .from("transport_routes")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name,
      route_number: routeNumber || null,
      start_location: startLocation || null,
      end_location: endLocation || null,
      fee_amount: feeAmount,
      vehicle_id: vehicleId,
      driver_id: driverId,
      departure_time: departureTime,
      return_time: returnTime,
      description,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true, data: route }
}

export async function updateRoute(routeId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const routeNumber = formData.get("route_number") as string
  const startLocation = formData.get("start_location") as string
  const endLocation = formData.get("end_location") as string
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const vehicleId = formData.get("vehicle_id") as string || null
  const driverId = formData.get("driver_id") as string || null
  const departureTime = formData.get("departure_time") as string || null
  const returnTime = formData.get("return_time") as string || null
  const description = formData.get("description") as string || null
  const isActive = formData.get("is_active") !== "false"

  const { error } = await adminClient
    .from("transport_routes")
    // @ts-ignore
    .update({
      name,
      route_number: routeNumber || null,
      start_location: startLocation || null,
      end_location: endLocation || null,
      fee_amount: feeAmount,
      vehicle_id: vehicleId,
      driver_id: driverId,
      departure_time: departureTime,
      return_time: returnTime,
      description,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", routeId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true }
}

export async function deleteRoute(routeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("transport_routes")
    .delete()
    .eq("id", routeId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true }
}

// ============ Route Stops Actions ============

export async function createRouteStop(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const routeId = formData.get("route_id") as string
  const stopName = formData.get("stop_name") as string
  const stopOrder = parseInt(formData.get("stop_order") as string) || 1
  const pickupTime = formData.get("pickup_time") as string || null
  const dropoffTime = formData.get("dropoff_time") as string || null
  const landmark = formData.get("landmark") as string || null

  if (!routeId || !stopName) {
    return { error: "Route and stop name are required" }
  }

  const { data: stop, error } = await adminClient
    .from("route_stops")
    // @ts-ignore
    .insert({
      route_id: routeId,
      stop_name: stopName,
      stop_order: stopOrder,
      pickup_time: pickupTime,
      dropoff_time: dropoffTime,
      landmark,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true, data: stop }
}

export async function updateRouteStop(stopId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const stopName = formData.get("stop_name") as string
  const stopOrder = parseInt(formData.get("stop_order") as string) || 1
  const pickupTime = formData.get("pickup_time") as string || null
  const dropoffTime = formData.get("dropoff_time") as string || null
  const landmark = formData.get("landmark") as string || null

  const { error } = await adminClient
    .from("route_stops")
    // @ts-ignore
    .update({
      stop_name: stopName,
      stop_order: stopOrder,
      pickup_time: pickupTime,
      dropoff_time: dropoffTime,
      landmark,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", stopId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true }
}

export async function deleteRouteStop(stopId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("route_stops")
    .delete()
    .eq("id", stopId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport/routes")
  return { success: true }
}

// ============ Vehicles Actions ============

export async function getVehicles() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: vehicles, error } = await adminClient
    .from("vehicles")
    .select(`
      *,
      driver:drivers(id, name, phone)
    `)
    .eq("school_id", context.schoolId)
    .order("plate_number", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: vehicles }
}

export async function createVehicle(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const plateNumber = formData.get("plate_number") as string
  const vehicleType = formData.get("vehicle_type") as string || "bus"
  const make = formData.get("make") as string || null
  const model = formData.get("model") as string || null
  const year = parseInt(formData.get("year") as string) || null
  const capacity = parseInt(formData.get("capacity") as string) || 30
  const color = formData.get("color") as string || null
  const driverId = formData.get("driver_id") as string || null
  const insuranceNumber = formData.get("insurance_number") as string || null
  const insuranceExpiry = formData.get("insurance_expiry") as string || null
  const registrationExpiry = formData.get("registration_expiry") as string || null

  if (!plateNumber) {
    return { error: "Plate number is required" }
  }

  const { data: vehicle, error } = await adminClient
    .from("vehicles")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      plate_number: plateNumber,
      vehicle_type: vehicleType,
      make,
      model,
      year,
      capacity,
      color,
      driver_id: driverId,
      insurance_number: insuranceNumber,
      insurance_expiry: insuranceExpiry,
      registration_expiry: registrationExpiry,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/vehicles")
  return { success: true, data: vehicle }
}

export async function updateVehicle(vehicleId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const plateNumber = formData.get("plate_number") as string
  const vehicleType = formData.get("vehicle_type") as string || "bus"
  const make = formData.get("make") as string || null
  const model = formData.get("model") as string || null
  const year = parseInt(formData.get("year") as string) || null
  const capacity = parseInt(formData.get("capacity") as string) || 30
  const color = formData.get("color") as string || null
  const driverId = formData.get("driver_id") as string || null
  const insuranceNumber = formData.get("insurance_number") as string || null
  const insuranceExpiry = formData.get("insurance_expiry") as string || null
  const registrationExpiry = formData.get("registration_expiry") as string || null
  const isActive = formData.get("is_active") !== "false"

  const { error } = await adminClient
    .from("vehicles")
    // @ts-ignore
    .update({
      plate_number: plateNumber,
      vehicle_type: vehicleType,
      make,
      model,
      year,
      capacity,
      color,
      driver_id: driverId,
      insurance_number: insuranceNumber,
      insurance_expiry: insuranceExpiry,
      registration_expiry: registrationExpiry,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", vehicleId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/vehicles")
  return { success: true }
}

export async function deleteVehicle(vehicleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/vehicles")
  return { success: true }
}

// ============ Drivers Actions ============

export async function getDrivers() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { data: drivers, error } = await adminClient
    .from("drivers")
    .select("*")
    .eq("school_id", context.schoolId)
    .order("name", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { data: drivers }
}

export async function createDriver(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const phone = formData.get("phone") as string || null
  const email = formData.get("email") as string || null
  const licenseNumber = formData.get("license_number") as string || null
  const licenseExpiry = formData.get("license_expiry") as string || null
  const address = formData.get("address") as string || null
  const emergencyContact = formData.get("emergency_contact") as string || null
  const emergencyPhone = formData.get("emergency_phone") as string || null

  if (!name) {
    return { error: "Driver name is required" }
  }

  const { data: driver, error } = await adminClient
    .from("drivers")
    // @ts-ignore
    .insert({
      school_id: context.schoolId,
      name,
      phone,
      email,
      license_number: licenseNumber,
      license_expiry: licenseExpiry,
      address,
      emergency_contact: emergencyContact,
      emergency_phone: emergencyPhone,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/drivers")
  return { success: true, data: driver }
}

export async function updateDriver(driverId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const name = formData.get("name") as string
  const phone = formData.get("phone") as string || null
  const email = formData.get("email") as string || null
  const licenseNumber = formData.get("license_number") as string || null
  const licenseExpiry = formData.get("license_expiry") as string || null
  const address = formData.get("address") as string || null
  const emergencyContact = formData.get("emergency_contact") as string || null
  const emergencyPhone = formData.get("emergency_phone") as string || null
  const isActive = formData.get("is_active") !== "false"

  const { error } = await adminClient
    .from("drivers")
    // @ts-ignore
    .update({
      name,
      phone,
      email,
      license_number: licenseNumber,
      license_expiry: licenseExpiry,
      address,
      emergency_contact: emergencyContact,
      emergency_phone: emergencyPhone,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", driverId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/drivers")
  return { success: true }
}

export async function deleteDriver(driverId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("drivers")
    .delete()
    .eq("id", driverId)
    .eq("school_id", context.schoolId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/drivers")
  return { success: true }
}

// ============ Student Transport Assignments ============

export async function getStudentTransportAssignments(filters?: {
  routeId?: string
  academicYearId?: string
  termId?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  let query = adminClient
    .from("student_transport")
    .select(`
      *,
      student:students(id, first_name, last_name, admission_number),
      route:transport_routes(id, name, route_number),
      stop:route_stops(id, stop_name)
    `)

  if (filters?.routeId) {
    query = query.eq("route_id", filters.routeId)
  }

  if (filters?.academicYearId) {
    query = query.eq("academic_year_id", filters.academicYearId)
  }

  if (filters?.termId) {
    query = query.eq("term_id", filters.termId)
  }

  const { data: assignments, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { data: assignments }
}

export async function assignStudentToTransport(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const studentId = formData.get("student_id") as string
  const routeId = formData.get("route_id") as string
  const stopId = formData.get("stop_id") as string || null
  const academicYearId = formData.get("academic_year_id") as string
  const termId = formData.get("term_id") as string || null
  const transportType = formData.get("transport_type") as string || "both"
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const startDate = formData.get("start_date") as string || null
  const endDate = formData.get("end_date") as string || null

  if (!studentId || !routeId || !academicYearId) {
    return { error: "Student, route, and academic year are required" }
  }

  const { data: assignment, error } = await adminClient
    .from("student_transport")
    // @ts-ignore
    .insert({
      student_id: studentId,
      route_id: routeId,
      stop_id: stopId,
      academic_year_id: academicYearId,
      term_id: termId,
      transport_type: transportType,
      fee_amount: feeAmount,
      start_date: startDate,
      end_date: endDate,
    } as any)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/assignments")
  return { success: true, data: assignment }
}

export async function updateStudentTransport(assignmentId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const stopId = formData.get("stop_id") as string || null
  const transportType = formData.get("transport_type") as string || "both"
  const feeAmount = parseFloat(formData.get("fee_amount") as string) || 0
  const feePaid = parseFloat(formData.get("fee_paid") as string) || 0
  const paymentStatus = formData.get("payment_status") as string || "pending"
  const startDate = formData.get("start_date") as string || null
  const endDate = formData.get("end_date") as string || null
  const isActive = formData.get("is_active") !== "false"

  const { error } = await adminClient
    .from("student_transport")
    // @ts-ignore
    .update({
      stop_id: stopId,
      transport_type: transportType,
      fee_amount: feeAmount,
      fee_paid: feePaid,
      payment_status: paymentStatus,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", assignmentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/assignments")
  return { success: true }
}

export async function removeStudentFromTransport(assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const { error } = await adminClient
    .from("student_transport")
    .delete()
    .eq("id", assignmentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard/admin/transport")
  revalidatePath("/dashboard/admin/transport/assignments")
  return { success: true }
}

// ============ Transport Dashboard Stats ============

export async function getTransportStats() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const context = await requireTenantContext(user.id)
  if (!context) {
    return { error: "No school context" }
  }

  const adminClient = createServiceRoleClient()

  const [
    { count: routesCount },
    { count: vehiclesCount },
    { count: driversCount },
    { count: activeAssignmentsCount },
  ] = await Promise.all([
    adminClient
      .from("transport_routes")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    adminClient
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    adminClient
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("school_id", context.schoolId)
      .eq("is_active", true),
    adminClient
      .from("student_transport")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ])

  return {
    data: {
      routes: routesCount || 0,
      vehicles: vehiclesCount || 0,
      drivers: driversCount || 0,
      activeAssignments: activeAssignmentsCount || 0,
    }
  }
}
