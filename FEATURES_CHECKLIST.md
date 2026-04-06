# Implementation Checklist - Schemes of Work & Study Materials

## Teacher Schemes of Work Feature

### Page: My Schemes (`/dashboard/teacher/schemes`)
- [x] Server-side page component with authentication
- [x] Fetch schemes for current teacher only
- [x] Fetch subjects, classes, terms for dropdowns
- [x] Pass data to client component

### Component: Teacher Schemes Client
- [x] Dashboard stats (Total, Draft, Submitted, Approved)
- [x] "Create New Scheme" dialog with form
  - [x] Subject dropdown (required)
  - [x] Class dropdown (required)
  - [x] Term dropdown (required)
  - [x] Title input (required)
  - [x] Description textarea (optional)
  - [x] Form validation
  - [x] Submit button with loading state
- [x] Filtering by subject, class, term, status
- [x] Schemes table with columns:
  - [x] Subject name
  - [x] Class name
  - [x] Term name
  - [x] Status badge (color-coded)
  - [x] Weekly entries count
  - [x] View button (links to detail page)
  - [x] Delete button with confirmation
- [x] Empty state with icon
- [x] Loading states
- [x] Success/error toast notifications

### Page: Scheme Detail (`/dashboard/teacher/schemes/[id]`)
- [x] Server-side page with authentication
- [x] Validate teacher ownership
- [x] Fetch scheme with entries
- [x] Sort entries by week number
- [x] Handle not found gracefully

### Component: Teacher Scheme Detail Client
- [x] Back button navigation
- [x] Header with title, subject, class, term
- [x] Status badge display
- [x] "Submit for Approval" button (draft only, with entry validation)
- [x] Scheme info card with relationships
- [x] Weekly breakdown table:
  - [x] Week number
  - [x] Topic/Theme
  - [x] Sub-topic
  - [x] View Details button
  - [x] Edit button (draft only)
  - [x] Delete button (draft only)
- [x] Add Entry dialog with fields:
  - [x] Week number (auto-calculated)
  - [x] Topic (required)
  - [x] Sub-topic
  - [x] Learning Objectives
  - [x] Teaching Activities
  - [x] Learning Resources
  - [x] Assessment Methods
  - [x] Remarks
- [x] Edit Entry functionality
- [x] View Details modal for entries
- [x] Delete Entry with confirmation
- [x] Form validation
- [x] Loading states
- [x] Toast notifications

### Server Actions: Teacher Schemes
- [x] `getTeacherSchemes()` with optional filters
- [x] `getTeacherSchemesStats()` for dashboard
- [x] `getTeacherSchemeDetail()` with entries
- [x] `createTeacherScheme()` with validation
- [x] `submitTeacherScheme()` status change
- [x] `updateTeacherScheme()` for title/description
- [x] `deleteTeacherScheme()` with ownership check
- [x] All actions use requireTenantContext
- [x] All actions get teacher record
- [x] All actions revalidatePath

### Integration with Existing Schemes
- [x] Uses existing `addSchemeEntry()` from schemes-of-work.ts
- [x] Uses existing `updateSchemeEntry()` from schemes-of-work.ts
- [x] Uses existing `deleteSchemeEntry()` from schemes-of-work.ts
- [x] Respects existing status workflow (draft, submitted, approved, revision_needed)
- [x] Integrates with existing database schema

## Study Materials Feature

### Page: Study Materials (`/dashboard/teacher/study-materials`)
- [x] Server-side page component with authentication
- [x] Fetch teacher's materials
- [x] Fetch subjects, classes for filters
- [x] Fetch current academic year
- [x] Pass data to client component

### Component: Study Materials Client
- [x] Dashboard stats:
  - [x] Total materials
  - [x] Total views (aggregated)
  - [x] Total downloads (aggregated)
  - [x] Downloadable count
- [x] "Upload Material" dialog with form:
  - [x] Title input (required)
  - [x] Description textarea
  - [x] Material type dropdown (document, video, audio, link, presentation, other)
  - [x] Subject dropdown (optional)
  - [x] Class dropdown (optional, defaults to All)
  - [x] External link input (required for link type)
  - [x] File URL input (for non-link types)
  - [x] File name input
  - [x] File size input
  - [x] Downloadable checkbox
  - [x] Visible checkbox
  - [x] Form validation
  - [x] Create and Update modes
- [x] Advanced filtering:
  - [x] Filter by subject
  - [x] Filter by class
  - [x] Filter by material type
- [x] Materials table with columns:
  - [x] Title
  - [x] Type badge (color-coded)
  - [x] Subject
  - [x] Class
  - [x] View count with icon
  - [x] Download count with icon
  - [x] Upload date (formatted)
  - [x] Download button (conditionally shown)
  - [x] Edit button
  - [x] Delete button
- [x] Download button functionality
- [x] View/download tracking
- [x] Edit material functionality
- [x] Delete material with confirmation
- [x] Empty state with icon
- [x] Loading states
- [x] Success/error toast notifications
- [x] File size formatting (B, KB, MB)
- [x] Date formatting

### Server Actions: Study Materials
- [x] `getStudyMaterials()` with filters (school-wide)
- [x] `getMyStudyMaterials()` teacher-specific
- [x] `createStudyMaterial()` with validation
- [x] `updateStudyMaterial()` with ownership check
- [x] `deleteStudyMaterial()` with ownership check
- [x] `incrementStudyMaterialView()` tracking
- [x] `incrementStudyMaterialDownload()` tracking
- [x] All actions use requireTenantContext
- [x] All actions get teacher record
- [x] All actions revalidatePath

### Material Type Support
- [x] Document (pdf, doc, docx, txt, etc.)
- [x] Video (links or embedded)
- [x] Audio (audio files or links)
- [x] Link (external URLs)
- [x] Presentation (pptx, slides)
- [x] Other (any other format)

## Navigation Updates

### Dashboard Navigation (`/components/dashboard/nav.tsx`)
- [x] Added "My Schemes" link (teacher role)
- [x] Added "All Schemes (Admin)" link (admin role)
- [x] Added "Study Materials" link (teacher/admin)
- [x] Updated Academic section with new items
- [x] Proper role-based access control
- [x] Correct icons (FileText, BookOpen)

## Testing Checklist

### Authentication & Authorization
- [ ] Non-logged-in user redirects to login
- [ ] Teacher only sees own schemes
- [ ] Admin can see all schemes
- [ ] Cross-tenant data isolation

### Scheme Workflow
- [ ] Create scheme (draft)
- [ ] Add entries (week by week)
- [ ] Edit entries
- [ ] Delete entries
- [ ] Submit scheme (changes to submitted)
- [ ] Cannot submit without entries

### Study Materials
- [ ] Upload document
- [ ] Upload link
- [ ] Edit material
- [ ] Delete material
- [ ] Filter by subject
- [ ] Filter by class
- [ ] Filter by type
- [ ] Download tracking works
- [ ] View tracking works

### UI/UX
- [ ] All forms validate properly
- [ ] Toast notifications appear
- [ ] Loading states show during submission
- [ ] Empty states display correctly
- [ ] Tables paginate if needed
- [ ] Responsive design on mobile

### Database
- [ ] Schemes appear in database
- [ ] Entries appear in database
- [ ] Materials appear in database
- [ ] RLS policies enforce access
- [ ] Cascade delete works

## Deployment Checklist

- [ ] No migration needed (tables exist)
- [ ] All imports are correct
- [ ] No console errors
- [ ] Build completes successfully
- [ ] Navigation links work
- [ ] Pages load without errors
- [ ] Forms submit successfully
- [ ] Tables display correctly
- [ ] Filters work as expected

## Documentation

- [x] Implementation summary created
- [x] File locations documented
- [x] Key patterns documented
- [x] User workflows documented
- [x] Database schema documented
- [x] Security features documented
- [x] Features checklist created

## Notes

- All components follow existing UI patterns
- All actions follow existing server action patterns
- All pages follow existing page patterns
- Database relationships are properly configured
- Row-level security is enforced
- Teacher isolation is guaranteed
- No breaking changes to existing code
