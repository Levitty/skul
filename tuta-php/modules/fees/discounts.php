<?php
/**
 * Fee Discounts — manage discount/concession types and assign them to students.
 */
$pageTitle = 'Fee Discounts';
$sb  = new Supabase();
$sid = schoolId();

// Fetch fee heads for the assign modal dropdown. class_id matters: a school
// repeats the same head name per class (Tuition Fee × 12), so unfiltered the
// picker is an unusable wall — the JS narrows it to the chosen student's class.
$feeHeadsResult = $sb->from('fee_heads')->select('id,name,class_id')->eq('school_id', $sid)->eq('is_active', 'true')->order('name')->execute();
$feeHeads = $feeHeadsResult['data'] ?? [];

$classRows  = $sb->from('classes')->select('id,name,level')->eq('school_id', $sid)->order('level')->execute()['data'] ?? [];
$classNames = [];
foreach ($classRows as $c) $classNames[$c['id']] = $c['name'];

// Fetch students — chunked walk so we don't silently truncate at 1000 rows.
// Capped via fetchAllPaged's internal maxPages (20 × 1000 = 20k) which is more
// than any single school will have. Encoded to JSON for the client-side picker.
$students = Supabase::fetchAllPaged(
    fn($_sb) => $_sb->from('students')
        ->select('id,first_name,last_name,admission_number,current_class_id')
        ->eq('school_id', $sid)
        ->order('first_name')
);

// ── POST Handlers ────────────────────────────────────
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // Add discount
    if ($action === 'add') {
        $name        = input('name');
        $type        = input('type');
        $value       = (float)input('value');
        $description = input('description');

        if (!$name || !$type || $value <= 0) {
            flash('error', 'Name, type, and a positive value are required.');
        } elseif (!in_array($type, ['percentage', 'fixed'])) {
            flash('error', 'Invalid discount type.');
        } elseif ($type === 'percentage' && $value > 100) {
            flash('error', 'Percentage cannot exceed 100.');
        } else {
            $result = $sb->from('fee_discounts')->insert([
                'school_id'   => $sid,
                'name'        => $name,
                'type'        => $type,
                'value'       => $value,
                'description' => $description ?: null,
                'is_active'   => true,
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Discount created.');
            }
        }
        redirect('fees/discounts');
    }

    // Edit discount
    if ($action === 'edit') {
        $id          = input('discount_id');
        $name        = input('name');
        $type        = input('type');
        $value       = (float)input('value');
        $description = input('description');

        if (!$name || !$type || $value <= 0) {
            flash('error', 'Name, type, and a positive value are required.');
        } elseif (!in_array($type, ['percentage', 'fixed'])) {
            flash('error', 'Invalid discount type.');
        } elseif ($type === 'percentage' && $value > 100) {
            flash('error', 'Percentage cannot exceed 100.');
        } else {
            $result = $sb->from('fee_discounts')->eq('id', $id)->eq('school_id', $sid)->update([
                'name'        => $name,
                'type'        => $type,
                'value'       => $value,
                'description' => $description ?: null,
                'updated_at'  => date('c'),
            ]);
            if ($result['error']) {
                flash('error', $result['error']);
            } else {
                flash('success', 'Discount updated.');
            }
        }
        redirect('fees/discounts');
    }

    // Toggle active/inactive
    if ($action === 'toggle') {
        $id        = input('discount_id');
        $newStatus = input('is_active') === '1' ? false : true;
        $result = $sb->from('fee_discounts')->eq('id', $id)->eq('school_id', $sid)->update([
            'is_active'  => $newStatus,
            'updated_at' => date('c'),
        ]);
        if ($result['error']) {
            flash('error', $result['error']);
        } else {
            flash('success', $newStatus ? 'Discount activated.' : 'Discount deactivated.');
        }
        redirect('fees/discounts');
    }

    // Assign discount to student.
    // Scope: 'all' (whole invoice — fee_head_id NULL)
    //     OR 'specific' (a single fee head — fee_head_id required)
    if ($action === 'assign') {
        $discountId = input('fee_discount_id');
        $studentId  = input('student_id');
        $scope      = input('scope') === 'specific' ? 'specific' : 'all';
        $feeHeadId  = ($scope === 'specific') ? (input('fee_head_id') ?: null) : null;

        // student_discounts has no school_id — validate every referenced row
        // belongs to THIS school before inserting, or a bursar could attach a
        // discount to (or referencing) another tenant's records.
        $okStudent  = $studentId && !empty(($sb->from('students')->select('id')->eq('id', $studentId)->eq('school_id', $sid)->single()->execute())['data']);
        $okDiscount = $discountId && !empty(($sb->from('fee_discounts')->select('id')->eq('id', $discountId)->eq('school_id', $sid)->single()->execute())['data']);
        $okFeeHead  = !$feeHeadId || !empty(($sb->from('fee_heads')->select('id')->eq('id', $feeHeadId)->eq('school_id', $sid)->single()->execute())['data']);

        if (!$discountId || !$studentId) {
            flash('error', 'Student and discount are required.');
        } elseif ($scope === 'specific' && !$feeHeadId) {
            flash('error', 'Pick a fee type, or switch to "Entire invoice".');
        } elseif (!$okStudent || !$okDiscount || !$okFeeHead) {
            flash('error', 'Invalid student, discount, or fee type.');
        } else {
            // Maker-checker: if discount approval is on, the assignment lands as
            // 'pending' (not billed) and a second admin must approve it under
            // System → Approvals. Off → applied immediately as before.
            $needApproval = approvalRequired('require_approval_discount', 'false');
            $result = $sb->from('student_discounts')->insert([
                'student_id'      => $studentId,
                'fee_discount_id' => $discountId,
                'fee_head_id'     => $feeHeadId,
                'status'          => $needApproval ? 'pending' : 'approved',
            ]);
            if ($result['error']) {
                // Friendlier message for the most common case (duplicate)
                $err = $result['error'];
                if (stripos($err, 'duplicate') !== false || stripos($err, 'unique') !== false) {
                    $err = 'This student already has this discount with that scope.';
                }
                flash('error', $err);
            } elseif ($needApproval) {
                $newId = $result['data'][0]['id'] ?? null;
                $stu   = $sb->from('students')->select('first_name,last_name')->eq('id', $studentId)->single()->execute();
                $dsc   = $sb->from('fee_discounts')->select('name')->eq('id', $discountId)->single()->execute();
                $sname = trim(($stu['data'][0]['first_name'] ?? '') . ' ' . ($stu['data'][0]['last_name'] ?? ''));
                $dname = $dsc['data'][0]['name'] ?? 'Discount';
                $u     = currentUser();
                $sb->from('approval_requests')->insert([
                    'school_id'       => $sid,
                    'action_type'     => 'assign_discount',
                    'target_type'     => 'student_discount',
                    'target_id'       => $newId,
                    'payload'         => json_encode(['reason' => "Assign “{$dname}” to {$sname}" . ($feeHeadId ? ' (specific fee)' : ' (entire invoice)')]),
                    'status'          => 'pending',
                    'requested_by'    => $u['email'] ?? null,
                    'requested_by_id' => $u['id'] ?? null,
                ]);
                auditLog('approval_requested', 'student_discount', $newId, ['action' => 'assign_discount', 'student' => $sname, 'discount' => $dname]);
                flash('success', 'Discount sent for approval — an administrator must approve it before it applies.');
            } else {
                flash('success', 'Discount assigned to student.');
            }
        }
        redirect('fees/discounts');
    }

    // Remove student discount assignment
    if ($action === 'unassign') {
        $assignId = input('assignment_id');
        if ($assignId) {
            // Verify the assignment's student belongs to this school before
            // deleting (the row itself has no school_id to filter on).
            $row = $sb->from('student_discounts')->select('student_id')->eq('id', $assignId)->single()->execute();
            $stuId = $row['data'][0]['student_id'] ?? null;
            $owned = $stuId && !empty(($sb->from('students')->select('id')->eq('id', $stuId)->eq('school_id', $sid)->single()->execute())['data']);
            if ($owned) {
                $sb->from('student_discounts')->eq('id', $assignId)->delete();
                flash('success', 'Discount assignment removed.');
            } else {
                flash('error', 'Discount assignment not found.');
            }
        }
        redirect('fees/discounts');
    }
}

// ── Fetch discounts ──────────────────────────────────
$discountsResult = $sb->from('fee_discounts')->select('*')->eq('school_id', $sid)->order('name')->execute();
$discounts = $discountsResult['data'] ?? [];

// Collect discount IDs for batch-loading assignments
$discountIds = array_column($discounts, 'id');

// Fetch all student_discounts for these discounts
$assignments = [];
$assignmentsByDiscount = [];
if (!empty($discountIds)) {
    $assignResult = $sb->from('student_discounts')->select('*')->in('fee_discount_id', $discountIds)->execute();
    $assignments = $assignResult['data'] ?? [];
    foreach ($assignments as $a) {
        $assignmentsByDiscount[$a['fee_discount_id']][] = $a;
    }
}

// Build lookup maps
$studentMap = [];
foreach ($students as $s) {
    $studentMap[$s['id']] = trim($s['first_name'] . ' ' . $s['last_name']) . ($s['admission_number'] ? ' (' . $s['admission_number'] . ')' : '');
}
$feeHeadMap = [];
foreach ($feeHeads as $fh) {
    $feeHeadMap[$fh['id']] = $fh['name'];
}

// Count active assignments per discount
$assignCounts = [];
foreach ($discounts as $d) {
    $assignCounts[$d['id']] = count($assignmentsByDiscount[$d['id']] ?? []);
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold text-gray-900">Fee Discounts</h1>
        <p class="text-sm text-gray-500 mt-1"><?= count($discounts) ?> discount<?= count($discounts) !== 1 ? 's' : '' ?> configured</p>
    </div>
    <button onclick="document.getElementById('addModal').classList.remove('hidden')" class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
        + Add Discount
    </button>
</div>

<!-- How discounts apply — sets expectations so assigning one isn't mistaken for editing past invoices. -->
<div class="flex items-start gap-2.5 mb-6 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-800">
    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    <p class="text-xs leading-relaxed">
        Assigning a discount reduces the student's <strong>next generated invoice</strong> — it shows as a
        separate line and lowers the total automatically. It does <strong>not</strong> change invoices that
        already exist; re-generate that student's invoice to apply it.
    </p>
</div>

<!-- Discounts Table -->
<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
    <table class="w-full text-sm">
        <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Value</th>
                <th class="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th class="text-center px-4 py-3 font-semibold text-gray-600">Students</th>
                <th class="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
            <?php if (empty($discounts)): ?>
                <tr><td colspan="7" class="px-4 py-12 text-center text-gray-400">No discounts yet. Click "+ Add Discount" to create one.</td></tr>
            <?php else: ?>
                <?php foreach ($discounts as $d): ?>
                    <tr class="hover:bg-gray-50/50">
                        <td class="px-4 py-3 font-medium text-gray-900"><?= e($d['name']) ?></td>
                        <td class="px-4 py-3">
                            <?php if ($d['type'] === 'percentage'): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Percentage</span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Fixed</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900">
                            <?php if ($d['type'] === 'percentage'): ?>
                                <?= number_format((float)$d['value'], 1) ?>%
                            <?php else: ?>
                                <?= money((float)$d['value']) ?>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-gray-600 max-w-xs truncate"><?= e($d['description'] ?? '—') ?></td>
                        <td class="px-4 py-3 text-center">
                            <?php if ($d['is_active']): ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
                            <?php else: ?>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                            <?php endif; ?>
                        </td>
                        <td class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                <?= $assignCounts[$d['id']] ?? 0 ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                            <button onclick="openAssignModal('<?= e($d['id']) ?>', '<?= e(addslashes($d['name'])) ?>')" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">Assign</button>
                            <button onclick="editDiscount('<?= e($d['id']) ?>','<?= e(addslashes($d['name'])) ?>','<?= e($d['type']) ?>',<?= (float)$d['value'] ?>,'<?= e(addslashes($d['description'] ?? '')) ?>')" class="text-emerald-600 hover:text-emerald-800 text-xs font-medium mr-2">Edit</button>
                            <form method="POST" class="inline">
                                <?= csrfField() ?>
                                <input type="hidden" name="action" value="toggle">
                                <input type="hidden" name="discount_id" value="<?= e($d['id']) ?>">
                                <input type="hidden" name="is_active" value="<?= $d['is_active'] ? '1' : '0' ?>">
                                <button type="submit" class="text-xs font-medium mr-2 <?= $d['is_active'] ? 'text-orange-500 hover:text-orange-700' : 'text-emerald-600 hover:text-emerald-800' ?>">
                                    <?= $d['is_active'] ? 'Deactivate' : 'Activate' ?>
                                </button>
                            </form>
                        </td>
                    </tr>
                    <?php
                    // Show assigned students inline
                    $discAssign = $assignmentsByDiscount[$d['id']] ?? [];
                    if (!empty($discAssign)):
                    ?>
                        <tr>
                            <td colspan="7" class="px-4 py-2 bg-gray-50/50">
                                <div class="ml-4">
                                    <p class="text-xs font-semibold text-gray-500 mb-1">Assigned Students:</p>
                                    <div class="flex flex-wrap gap-2">
                                        <?php
                                        $statusColors = [
                                            'approved' => 'bg-emerald-50 text-emerald-700',
                                            'pending'  => 'bg-amber-50 text-amber-700',
                                            'rejected' => 'bg-red-50 text-red-700',
                                            'expired'  => 'bg-gray-100 text-gray-500',
                                        ];
                                        foreach ($discAssign as $da):
                                            $sName = $studentMap[$da['student_id']] ?? 'Unknown';
                                            $fhName = $da['fee_head_id'] ? ($feeHeadMap[$da['fee_head_id']] ?? 'Unknown Head') : 'All Fees';
                                            $stColor = $statusColors[$da['status']] ?? 'bg-gray-100 text-gray-600';
                                        ?>
                                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white border border-gray-100 shadow-sm">
                                                <span class="font-medium text-gray-800"><?= e($sName) ?></span>
                                                <span class="text-gray-400">&middot;</span>
                                                <span class="text-gray-500"><?= e($fhName) ?></span>
                                                <span class="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium <?= $stColor ?>"><?= ucfirst($da['status']) ?></span>
                                                <form method="POST" class="inline" onsubmit="return confirm('Remove this assignment?')">
                                                    <?= csrfField() ?>
                                                    <input type="hidden" name="action" value="unassign">
                                                    <input type="hidden" name="assignment_id" value="<?= e($da['id']) ?>">
                                                    <button type="submit" class="text-red-400 hover:text-red-600 ml-1" title="Remove">&times;</button>
                                                </form>
                                            </span>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    <?php endif; ?>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<!-- Add Discount Modal -->
<div id="addModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Add Discount</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="add">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="name" required placeholder="e.g. Sibling Discount"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                <p class="text-xs text-gray-400 mt-1">Name it after the <strong>reason</strong> (Sibling, Staff child, Scholarship) — not a student. This name prints on every invoice it's applied to; you pick the student later via Assign.</p>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select name="type" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Select</option>
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                    <input type="number" name="value" required step="0.01" min="0.01" placeholder="e.g. 10"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea name="description" rows="2" placeholder="Optional notes about this discount"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm resize-none"></textarea>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Add Discount
                </button>
                <button type="button" onclick="document.getElementById('addModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Edit Discount Modal -->
<div id="editModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Discount</h3>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="discount_id" id="editId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" name="name" id="editName" required
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select name="type" id="editType" required class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                    <input type="number" name="value" id="editValue" required step="0.01" min="0.01"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea name="description" id="editDescription" rows="2"
                    class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm resize-none"></textarea>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">Save Changes</button>
                <button type="button" onclick="document.getElementById('editModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
        </form>
    </div>
</div>

<!-- Assign Discount Modal -->
<div id="assignModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 hidden">
    <div class="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold text-gray-900 mb-1">Assign Discount</h3>
        <p class="text-sm text-gray-500 mb-4" id="assignDiscountLabel"></p>
        <form method="POST">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="assign">
            <input type="hidden" name="fee_discount_id" id="assignDiscountId">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Student *</label>
                <!-- Type-ahead picker: replaces a select-with-1000-options that's
                     unusable on mobile. Filters client-side over pre-loaded JSON. -->
                <div class="relative">
                    <input type="text"
                           id="studentSearch"
                           placeholder="Type a name or admission number…"
                           autocomplete="off"
                           class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <input type="hidden" name="student_id" id="studentIdField" required>
                    <div id="studentResults"
                         class="hidden absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"></div>
                </div>
                <p id="studentSelected" class="hidden mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1">
                    Selected: <span class="font-semibold"></span>
                    <button type="button" id="studentClear" class="ml-1 text-emerald-600 hover:text-emerald-900">&times;</button>
                </p>
                <p class="text-xs text-gray-400 mt-1"><?= number_format(count($students)) ?> students available</p>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Apply discount to *</label>
                <div class="space-y-2">
                    <!-- Whole invoice -->
                    <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50">
                        <input type="radio"
                               name="scope"
                               value="all"
                               checked
                               class="mt-1 w-4 h-4 text-emerald-600"
                               onchange="document.getElementById('feeHeadPicker').classList.add('hidden'); document.getElementById('feeHeadSelect').required = false; document.getElementById('feeHeadSelect').value = '';">
                        <div>
                            <div class="text-sm font-medium text-gray-900">Entire invoice</div>
                            <div class="text-xs text-gray-500">Discount applies to the total of every invoice (Tuition, Transport, all fee heads).</div>
                        </div>
                    </label>
                    <!-- Specific fee head -->
                    <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50">
                        <input type="radio"
                               name="scope"
                               value="specific"
                               class="mt-1 w-4 h-4 text-emerald-600"
                               onchange="document.getElementById('feeHeadPicker').classList.remove('hidden'); document.getElementById('feeHeadSelect').required = true;">
                        <div class="flex-1">
                            <div class="text-sm font-medium text-gray-900">A specific fee type only</div>
                            <div class="text-xs text-gray-500">e.g. "10% off Tuition only" — other fees on the invoice are unaffected.</div>
                        </div>
                    </label>
                </div>
                <div id="feeHeadPicker" class="hidden mt-3 ml-7">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Choose fee type</label>
                    <select name="fee_head_id"
                            id="feeHeadSelect"
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">— Select a fee type —</option>
                        <?php foreach ($feeHeads as $fh): ?>
                            <option value="<?= e($fh['id']) ?>" data-class="<?= e($fh['class_id'] ?? '') ?>"><?= e($fh['name']) ?><?= !empty($fh['class_id']) ? ' — ' . e($classNames[$fh['class_id']] ?? 'class') : '' ?></option>
                        <?php endforeach; ?>
                    </select>
                    <p id="feeHeadHint" class="text-xs text-gray-400 mt-1">Pick the student first — this list narrows to their class.</p>
                </div>
            </div>

            <div class="flex gap-3">
                <button type="submit" class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
                    Assign Discount
                </button>
                <button type="button" onclick="document.getElementById('assignModal').classList.add('hidden')" class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    Cancel
                </button>
            </div>
        </form>
    </div>
</div>

<script>
function editDiscount(id, name, type, value, description) {
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editType').value = type;
    document.getElementById('editValue').value = value;
    document.getElementById('editDescription').value = description;
    document.getElementById('editModal').classList.remove('hidden');
}

function openAssignModal(discountId, discountName) {
    document.getElementById('assignDiscountId').value = discountId;
    document.getElementById('assignDiscountLabel').textContent = 'Assigning: ' + discountName;
    document.getElementById('assignModal').classList.remove('hidden');
    // Reset the student picker each time the modal opens
    document.getElementById('studentSearch').value = '';
    document.getElementById('studentIdField').value = '';
    document.getElementById('studentSelected').classList.add('hidden');
    document.getElementById('studentResults').classList.add('hidden');
}

// ── Student picker (type-ahead) ────────────────────────────────────
// Loads ALL students once, then filters client-side. Works for up to ~5000
// students. Above that, switch to a server-side search endpoint.
(function () {
    const students = <?= jsonHtml(array_map(fn($s) => [
        'id'    => $s['id'],
        'name'  => trim(($s['first_name'] ?? '') . ' ' . ($s['last_name'] ?? '')),
        'adm'   => $s['admission_number'] ?? '',
        'cls'   => $s['current_class_id'] ?? '',
    ], $students), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;

    const searchEl   = document.getElementById('studentSearch');
    const hiddenEl   = document.getElementById('studentIdField');
    const resultsEl  = document.getElementById('studentResults');
    const selectedEl = document.getElementById('studentSelected');
    const clearEl    = document.getElementById('studentClear');

    if (!searchEl) return; // assign modal not on this view

    // Fee-head narrowing: the master option list is captured once; picking a
    // student rebuilds the select with only their class's heads + school-wide
    // ones. Rebuilt via createElement (never innerHTML) so names stay inert.
    const feeSel  = document.getElementById('feeHeadSelect');
    const feeHint = document.getElementById('feeHeadHint');
    const allFeeOpts = feeSel ? Array.from(feeSel.options).map(o => ({ v: o.value, t: o.textContent, c: o.dataset.class || '' })) : [];

    function filterFeeHeads(cls) {
        if (!feeSel) return;
        const cur = feeSel.value;
        feeSel.innerHTML = '';
        let shown = 0;
        allFeeOpts.forEach(o => {
            if (!(o.v === '' || o.c === '' || (cls && o.c === cls))) return;
            const opt = document.createElement('option');
            opt.value = o.v;
            opt.textContent = (cls && o.v !== '') ? o.t.replace(/ — [^—]*$/, '') : o.t;
            opt.dataset.class = o.c;
            feeSel.appendChild(opt);
            if (o.v !== '') shown++;
        });
        feeSel.value = Array.from(feeSel.options).some(o => o.value === cur) ? cur : '';
        if (feeHint) feeHint.textContent = cls
            ? 'Showing the ' + shown + ' fee types for this student\'s class.'
            : 'Pick the student first — this list narrows to their class.';
    }

    function render(matches) {
        if (matches.length === 0) {
            resultsEl.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">No students match.</div>';
        } else {
            resultsEl.innerHTML = matches.map(s => {
                const label = s.adm ? `${s.name} <span class="text-gray-400">· ${s.adm}</span>` : s.name;
                return `<button type="button" data-id="${s.id}" data-name="${s.name}" data-cls="${s.cls || ''}"
                          class="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm border-b border-gray-50">${label}</button>`;
            }).join('');
        }
        resultsEl.classList.remove('hidden');
    }

    function pick(id, name, cls) {
        hiddenEl.value = id;
        selectedEl.querySelector('span').textContent = name;
        selectedEl.classList.remove('hidden');
        resultsEl.classList.add('hidden');
        searchEl.value = '';
        filterFeeHeads(cls || '');
    }

    searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        if (q.length < 2) { resultsEl.classList.add('hidden'); return; }
        const matches = students.filter(s =>
            s.name.toLowerCase().includes(q) || (s.adm || '').toLowerCase().includes(q)
        ).slice(0, 20); // cap shown — narrowed by user typing more
        render(matches);
    });

    resultsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-id]');
        if (btn) pick(btn.dataset.id, btn.dataset.name, btn.dataset.cls);
    });

    clearEl.addEventListener('click', () => {
        hiddenEl.value = '';
        selectedEl.classList.add('hidden');
        filterFeeHeads('');
        searchEl.focus();
    });

    // Click outside to close the dropdown
    document.addEventListener('click', (e) => {
        if (!searchEl.contains(e.target) && !resultsEl.contains(e.target)) {
            resultsEl.classList.add('hidden');
        }
    });
})();
</script>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
