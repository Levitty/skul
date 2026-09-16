<?php
/**
 * Edit an existing student — enriched form with tabbed sections.
 */
$pageTitle = 'Edit Student';
$sb  = new Supabase();
$sid = schoolId();
$id  = input('id');

if (!$id) redirect('students');

$studentResult = $sb->from('students')->select('*')->eq('id', $id)->eq('school_id', $sid)->single()->execute();
$student = $studentResult['data'][0] ?? null;
if (!$student) {
    flash('error', 'Student not found.');
    redirect('students');
}

$classes = cachedClasses();

// Fetch sections
$sectionRows = $sb->from('sections')->select('id,class_id,name')->execute();
$sections = $sectionRows['data'] ?? [];
$sectionsByClass = [];
foreach ($sections as $sec) {
    $sectionsByClass[$sec['class_id']][] = $sec;
}

$yearResult = $sb->from('academic_years')->select('id')->eq('school_id', $sid)->eq('is_current', 'true')->single()->execute();
$academicYearId = $yearResult['data'][0]['id'] ?? null;

$errors = [];

if (isPost() && verifyCsrf()) {
    $newClassId   = input('class_id') ?: null;
    $newSectionId = input('section_id') ?: null;
    $oldClassId   = $student['current_class_id'] ?? null;

    $data = [
        'first_name'             => input('first_name'),
        'last_name'              => input('last_name'),
        'admission_number'       => input('admission_number') ?: null,
        'gender'                 => input('gender') ?: null,
        'dob'                    => input('dob') ?: null,
        'current_class_id'       => $newClassId,
        'section_id'             => $newSectionId,
        'student_type'           => input('student_type') ?: 'day_scholar',
        'religion'               => input('religion') ?: null,
        'blood_group'            => input('blood_group') ?: null,
        'address'                => input('address') ?: null,
        'phone'                  => input('phone') ?: null,
        'email'                  => input('email') ?: null,
        'city'                   => input('city') ?: null,
        'country'                => input('country') ?: null,
        'birth_place'            => input('birth_place') ?: null,
        'roll_number'            => input('roll_number') ?: null,
        'admission_date'         => input('admission_date') ?: null,
        'family_id'              => input('family_id') ?: null,
        'guardian_name'          => input('guardian_name') ?: null,
        'guardian_phone'         => input('guardian_phone') ?: null,
        'guardian_name_2'        => input('guardian_name_2') ?: null,
        'guardian_phone_2'       => input('guardian_phone_2') ?: null,
        'guardian_relation_2'    => input('guardian_relation_2') ?: null,
        'previous_school_name'   => input('previous_school_name') ?: null,
        'previous_school_address'=> input('previous_school_address') ?: null,
        'previous_school_class'  => input('previous_school_class') ?: null,
        'previous_school_passout_year' => input('previous_school_passout_year') ? (int)input('previous_school_passout_year') : null,
        'extra_notes'            => input('extra_notes') ?: null,
        'updated_at'             => date('c'),
    ];

    if (!$data['first_name']) $errors[] = 'First name is required';
    if (!$data['last_name'])  $errors[] = 'Last name is required';

    if (empty($errors)) {
        $result = $sb->from('students')->eq('id', $id)->eq('school_id', $sid)->update($data);
        if ($result['error']) {
            $errors[] = $result['error'];
        } else {
            // If class changed, update/create enrollment
            if ($newClassId && $newClassId !== $oldClassId && $academicYearId) {
                $existingEnroll = $sb->from('enrollments')
                    ->select('id')
                    ->eq('student_id', $id)
                    ->eq('academic_year_id', $academicYearId)
                    ->single()
                    ->execute();

                if (!empty($existingEnroll['data'])) {
                    $sb->from('enrollments')
                        ->eq('student_id', $id)
                        ->eq('academic_year_id', $academicYearId)
                        ->update(['class_id' => $newClassId, 'section_id' => $newSectionId, 'updated_at' => date('c')]);
                } else {
                    $sb->from('enrollments')->insert([
                        'student_id'       => $id,
                        'class_id'         => $newClassId,
                        'section_id'       => $newSectionId,
                        'academic_year_id' => $academicYearId,
                        'school_id'        => $sid,
                    ]);
                }
            }
            flash('success', 'Student updated.');
            redirect('students');
        }
    }
}

// Shorthand for pre-filling — POST values override stored values
function val(string $field) {
    global $student;
    return input($field) ?: ($student[$field] ?? '');
}

$s = $student;
require __DIR__ . '/../../includes/layout-top.php';
?>

<script>
function showTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
    document.getElementById('tab-' + tab).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(function(b) {
        if (b.dataset.tab === tab) {
            b.className = 'tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50/50';
        } else {
            b.className = 'tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700';
        }
    });
}
</script>

<div class="mb-6">
    <a href="<?= baseUrl('students') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Students</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">Edit Student</h1>
    <p class="text-sm text-gray-500 mt-1"><?= e($s['first_name'] . ' ' . $s['last_name']) ?><?= $s['admission_number'] ? ' — ' . e($s['admission_number']) : '' ?></p>
</div>

<?php if (!empty($errors)): ?>
    <div class="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        <?php foreach ($errors as $err): ?><p><?= e($err) ?></p><?php endforeach; ?>
    </div>
<?php endif; ?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <!-- Tabs -->
    <div class="flex border-b border-gray-100 px-6 pt-4 gap-1" id="tabNav">
        <button type="button" onclick="showTab('personal')" class="tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50/50" data-tab="personal">Personal Info</button>
        <button type="button" onclick="showTab('guardian')" class="tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="guardian">Guardian</button>
        <button type="button" onclick="showTab('academic')" class="tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="academic">Academic</button>
        <button type="button" onclick="showTab('previous')" class="tab-btn px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="previous">Previous School</button>
    </div>

    <form method="POST" class="p-6">
        <?= csrfField() ?>

        <!-- Tab: Personal Info -->
        <div id="tab-personal" class="tab-panel">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input type="text" name="first_name" value="<?= e(val('first_name')) ?>" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input type="text" name="last_name" value="<?= e(val('last_name')) ?>" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <select name="gender" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="male"<?= selectedIf(val('gender'), 'male') ?>>Male</option>
                        <option value="female"<?= selectedIf(val('gender'), 'female') ?>>Female</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input type="date" name="dob" value="<?= e(val('dob')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Place of Birth</label>
                    <input type="text" name="birth_place" value="<?= e(val('birth_place')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Religion</label>
                    <input type="text" name="religion" value="<?= e(val('religion')) ?>" placeholder="e.g. Christian, Muslim" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                    <select name="blood_group" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <?php foreach (['A+','A-','B+','B-','AB+','AB-','O+','O-'] as $bg): ?>
                            <option value="<?= $bg ?>"<?= selectedIf(val('blood_group'), $bg) ?>><?= $bg ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Phone</label>
                    <input type="text" name="phone" value="<?= e(val('phone')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Email</label>
                    <input type="email" name="email" value="<?= e(val('email')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div class="sm:col-span-2 lg:col-span-3">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" name="address" value="<?= e(val('address')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input type="text" name="city" value="<?= e(val('city')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input type="text" name="country" value="<?= e(val('country')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
        </div>

        <!-- Tab: Guardian -->
        <div id="tab-guardian" class="tab-panel hidden">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                    <input type="text" name="guardian_name" value="<?= e(val('guardian_name')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
                    <input type="text" name="guardian_phone" value="<?= e(val('guardian_phone')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
            </div>

            <!-- Optional second contact — also receives SMS notices. Common where
                 parents are separated and both want school communication. -->
            <p class="text-xs font-medium text-gray-500 mt-5 mb-2">Second guardian <span class="text-gray-400 font-normal">(optional — also receives all SMS)</span></p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" name="guardian_name_2" value="<?= e(val('guardian_name_2')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" name="guardian_phone_2" value="<?= e(val('guardian_phone_2')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                    <select name="guardian_relation_2" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                        <option value="">—</option>
                        <?php foreach (['Mother','Father','Guardian','Grandparent','Aunt','Uncle','Sibling','Other'] as $rel): ?>
                            <option value="<?= e($rel) ?>" <?= val('guardian_relation_2') === $rel ? 'selected' : '' ?>><?= e($rel) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <label class="block text-sm font-medium text-blue-800 mb-1">Family ID</label>
                <input type="text" name="family_id" value="<?= e(val('family_id')) ?>" placeholder="e.g. FAM-001" class="w-full max-w-xs px-3 py-2 rounded-lg border border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white">
                <p class="text-xs text-blue-600 mt-1">Students with the same Family ID are linked as siblings for consolidated billing.</p>
            </div>
            <p class="text-xs text-gray-400 mt-4">Additional guardians and emergency contacts can be managed from the student profile page.</p>
        </div>

        <!-- Tab: Academic -->
        <div id="tab-academic" class="tab-panel hidden">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                    <input type="text" name="admission_number" value="<?= e(val('admission_number')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class</label>
                    <select name="class_id" id="classSelect" onchange="updateSections()" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select class</option>
                        <?php foreach ($classes as $c): ?>
                            <option value="<?= e($c['id']) ?>"<?= selectedIf(val('current_class_id'), $c['id']) ?>><?= e($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Stream</label>
                    <select name="section_id" id="sectionSelect" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">No section</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                    <input type="text" name="roll_number" value="<?= e(val('roll_number')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Student Type</label>
                    <select name="student_type" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="day_scholar"<?= selectedIf(val('student_type'), 'day_scholar') ?>>Day Scholar</option>
                        <option value="boarder"<?= selectedIf(val('student_type'), 'boarder') ?>>Boarder</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Admission Date</label>
                    <input type="date" name="admission_date" value="<?= e(val('admission_date')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
        </div>

        <!-- Tab: Previous School -->
        <div id="tab-previous" class="tab-panel hidden">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Previous School Name</label>
                    <input type="text" name="previous_school_name" value="<?= e(val('previous_school_name')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Previous School Address</label>
                    <input type="text" name="previous_school_address" value="<?= e(val('previous_school_address')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Class Attended</label>
                    <input type="text" name="previous_school_class" value="<?= e(val('previous_school_class')) ?>" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Year of Passing</label>
                    <input type="number" name="previous_school_passout_year" value="<?= e(val('previous_school_passout_year')) ?>" min="2000" max="2030" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Extra Notes</label>
                <textarea name="extra_notes" rows="3" class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm"><?= e(val('extra_notes')) ?></textarea>
            </div>
        </div>

        <!-- Submit -->
        <div class="mt-6 flex gap-3 border-t border-gray-100 pt-5">
            <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
            <a href="<?= baseUrl('students') ?>" class="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</a>
        </div>
    </form>
</div>

<script>
const sectionsByClass = <?= jsonHtml($sectionsByClass) ?>;
const currentSectionId = '<?= e($s['section_id'] ?? '') ?>';

function updateSections() {
    const classId = document.getElementById('classSelect').value;
    const sel = document.getElementById('sectionSelect');
    sel.innerHTML = '<option value="">No section</option>';
    if (classId && sectionsByClass[classId]) {
        sectionsByClass[classId].forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            if (s.id === currentSectionId) opt.selected = true;
            sel.appendChild(opt);
        });
    }
}

// Init sections on page load
updateSections();
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
