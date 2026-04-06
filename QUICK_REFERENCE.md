# Quick Reference - Schemes & Study Materials

## URLs & Routes

### Teacher Schemes
- List: `/dashboard/teacher/schemes`
- Detail: `/dashboard/teacher/schemes/[id]`

### Study Materials
- List & Manager: `/dashboard/teacher/study-materials`

### Admin Schemes
- List: `/dashboard/admin/academic/schemes`
- Detail: `/dashboard/admin/academic/schemes/[id]`

## File Paths

### Server Actions
```
lib/actions/
  ├── teacher-schemes.ts (NEW)
  ├── study-materials.ts (NEW)
  └── schemes-of-work.ts (EXISTING - reused)
```

### Pages
```
app/(dashboard)/dashboard/teacher/
  ├── schemes/
  │   ├── page.tsx (NEW)
  │   └── [id]/
  │       └── page.tsx (NEW)
  └── study-materials/
      └── page.tsx (NEW)
```

### Components
```
components/academic/
  ├── teacher-schemes-client.tsx (NEW)
  ├── teacher-scheme-detail-client.tsx (NEW)
  ├── study-materials-client.tsx (NEW)
  └── [other existing components]
```

### Navigation
```
components/dashboard/nav.tsx (MODIFIED)
```

## Key Functions

### Teacher Schemes Server Actions
```typescript
// List teacher's schemes
const { data } = await getTeacherSchemes({ term_id?, subject_id?, status? })

// Get single scheme with entries
const { data } = await getTeacherSchemeDetail(schemeId)

// Create new scheme
const { data } = await createTeacherScheme({ 
  subject_id, class_id, term_id, title, description? 
})

// Submit for approval
const { data } = await submitTeacherScheme(schemeId)

// Dashboard stats
const { data } = await getTeacherSchemesStats()
```

### Study Materials Server Actions
```typescript
// List materials (by teacher)
const { data } = await getMyStudyMaterials({ 
  class_id?, subject_id?, material_type?, term_id?
})

// List materials (school-wide visible)
const { data } = await getStudyMaterials({ 
  class_id?, subject_id?, material_type?, term_id?
})

// Create material
const { data } = await createStudyMaterial({ 
  title, description?, material_type, 
  file_url?, file_name?, file_size?,
  external_link?, class_id?, subject_id?,
  is_downloadable?, is_visible?
})

// Update material
const { data } = await updateStudyMaterial(materialId, {
  title?, description?, class_id?, subject_id?,
  is_downloadable?, is_visible?
})

// Track views/downloads
await incrementStudyMaterialView(materialId)
await incrementStudyMaterialDownload(materialId)
```

## Component Props

### TeacherSchemesClient
```typescript
interface Props {
  initialSchemes: Scheme[]
  subjects: Subject[]
  classes: Class[]
  terms: Term[]
}
```

### TeacherSchemeDetailClient
```typescript
interface Props {
  scheme: SchemeData & {
    scheme_entries: SchemeEntry[]
  }
}
```

### StudyMaterialsClient
```typescript
interface Props {
  initialMaterials: StudyMaterial[]
  subjects: Subject[]
  classes: Class[]
  currentAcademicYear: AcademicYear | null
}
```

## Status Workflow

### Schemes
- **Draft** (Gray) → Can add/edit/delete entries
- **Submitted** (Blue) → Waiting for admin approval
- **Approved** (Green) → Final, read-only
- **Revision Needed** (Amber) → Admin requested changes

### Submission Rule
- Cannot submit without at least 1 entry

## Material Types

| Type | Icon | Color | Use Case |
|------|------|-------|----------|
| document | 📄 | Blue | PDFs, DOCs, notes |
| video | 🎥 | Purple | Video links or embedded |
| audio | 🎵 | Green | Audio files |
| link | 🔗 | Orange | External URLs |
| presentation | 📊 | Red | Slides, PPTX |
| other | 📁 | Gray | Any other format |

## Entry Fields (Weekly Breakdown)

| Field | Type | Required | Example |
|-------|------|----------|---------|
| Week # | Number | Yes | 1-14 |
| Topic | Text | Yes | Cell Structure |
| Sub-topic | Text | No | Plant vs Animal |
| Objectives | Text | No | Students will learn... |
| Activities | Text | No | Group discussion... |
| Resources | Text | No | Textbook Ch. 5... |
| Assessment | Text | No | Quiz, worksheet... |
| Remarks | Text | No | Additional notes... |

## Filtering Options

### Schemes
- Subject (dropdown)
- Class (dropdown)
- Term (dropdown)
- Status (draft/submitted/approved/revision_needed)

### Materials
- Subject (dropdown)
- Class (dropdown)
- Material Type (6 options)

## Dashboard Stats

### Schemes
- Total Schemes
- Draft count
- Submitted count
- Approved count

### Materials
- Total Materials
- Total Views (aggregated)
- Total Downloads (aggregated)
- Downloadable count

## Error Messages

### Scheme Creation
- "Please fill in all required fields"
- "Title is required"
- "Not authenticated"
- "No school context"

### Scheme Submission
- "Add at least one weekly entry before submitting"

### Material Upload
- "Title is required"
- "Material type is required"
- "External link is required for link-type materials"

## Navigation Integration

### Academic Section Menu
```
Academic
  ├── Subjects (Admin only)
  ├── Homework
  ├── Assignments
  ├── Quizzes
  ├── Noticeboard (Admin)
  ├── Events (Admin)
  ├── Student Leaves
  ├── All Schemes (Admin) → /dashboard/admin/academic/schemes
  ├── My Schemes (Teacher) → /dashboard/teacher/schemes ✨ NEW
  ├── Study Materials → /dashboard/teacher/study-materials ✨ NEW
  └── Lesson Plans
```

## Security Model

1. **Authentication**
   - All pages require login
   - Redirects to /login if not authenticated

2. **Tenant Isolation**
   - Queries scoped to user's school(s)
   - Cannot access other schools' data

3. **Teacher Isolation**
   - Teachers only see own schemes
   - Teachers only see own materials
   - Verified by employee record lookup

4. **Admin Access**
   - Admins can see all schemes
   - Admins can manage approvals
   - Admins can share materials

5. **Role-Based Navigation**
   - Links show/hide based on role
   - URL access still validates server-side

## Common Workflows

### Create & Submit a Scheme
1. Go to "My Schemes"
2. Click "Create New Scheme"
3. Fill Subject, Class, Term, Title
4. Click "Create Scheme"
5. Click "View" on the new scheme
6. Click "Add Entry" for each week
7. Fill in weekly details
8. Repeat for all weeks (1-14)
9. Click "Submit for Approval"
10. Scheme becomes read-only, status = "submitted"

### Upload Study Material
1. Go to "Study Materials"
2. Click "Upload Material"
3. Fill Title (required)
4. Select Type (document/video/link/etc.)
5. Add Description (optional)
6. Select Subject & Class (optional)
7. For links: Enter URL
8. For files: Enter file metadata
9. Toggle Downloadable & Visible
10. Click "Upload Material"
11. Material appears in table

### Filter & Find Materials
1. Go to "Study Materials"
2. Use Filter cards at top
3. Select Subject, Class, or Type
4. Table updates instantly
5. Click row to view details
6. Click Download to access material

## Tips & Best Practices

- **Week Planning**: Plan all weeks 1-14 before submitting
- **Material Organization**: Use subjects/classes to organize materials
- **Descriptions**: Add descriptions for context
- **Sharing**: Set visibility=true to share with students
- **Tracking**: View/download counts help measure engagement
- **Revision**: Request revision returns scheme to draft mode
- **Backups**: Download schemes as PDF before submitting
- **Archiving**: Old materials can be hidden (is_visible=false)

## Performance Notes

- Schemes list loads instantly (indexed queries)
- Filtering is client-side (fast)
- Upload operations are server-side (safe)
- Large materials may take time to download
- View/download tracking is fire-and-forget (async)
- Page revalidation on mutations (ISR)

## Browser Compatibility

- Chrome/Edge: ✓ Full support
- Firefox: ✓ Full support
- Safari: ✓ Full support
- Mobile browsers: ✓ Responsive

## Known Limitations

- File uploads via UI not implemented (use external storage)
- No bulk operations
- No material preview in-app
- No real-time collaboration
- Comments/discussions not included
- No print-to-PDF (can use browser print)

## Future Features (Backlog)

- [ ] Material versioning
- [ ] Sharing with specific classes
- [ ] Collaborative editing
- [ ] Email notifications
- [ ] Curriculum mapping
- [ ] Material analytics
- [ ] Parent portal access
- [ ] Mobile app sync
