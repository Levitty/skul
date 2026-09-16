<?php
/**
 * Schedule edit page — view/edit a single fee schedule (a fee_group row).
 *
 * Modes:
 *   - GET ?id=<uuid>  → load existing schedule for editing
 *   - GET (no id)     → blank form for creating a new schedule
 *
 * Actions:
 *   - POST action=save         → upsert schedule + replace line items
 *   - POST action=roll_forward → clone this schedule into target term
 *   - POST action=delete       → delete (only if no invoices reference it)
 */
$pageTitle = 'Edit Schedule';
$sb  = new Supabase();
$sid = schoolId();

$classes  = cachedClasses();
$classMap = cachedClassMap();
$terms    = cachedTerms();
$feeHeads = cachedFeeHeads();

$termMap = [];
foreach ($terms as $t) $termMap[$t['id']] = $t;

$scheduleId = input('id');
$schedule   = null;
$items      = [];
$isNew      = !$scheduleId;

// ── Load existing schedule + items ─────────────────────────────
if (!$isNew) {
    $r = $sb->from('fee_groups')
        ->select('id,name,description,class_id,term_id,academic_year_id,billing_cycle,is_active')
        ->eq('id', $scheduleId)->eq('school_id', $sid)->single()->execute();
    $schedule = ($r['data'] ?? [])[0] ?? null;
    if (!$schedule) {
        flash('error', 'Schedule not found.');
        redirect('fees/schedules');
    }

    $itemsResult = $sb->from('fee_group_items')->select('id,fee_head_id,amount,sort_order')
        ->eq('fee_group_id', $scheduleId)->order('sort_order')->execute();
    $items = $itemsResult['data'] ?? [];
}

// ════════════════════════════════════════════════════════════════
// POST handlers
// ════════════════════════════════════════════════════════════════
if (isPost() && verifyCsrf()) {
    $action = input('action');

    // ── ROLL FORWARD ────────────────────────────────────────────
    if ($action === 'roll_forward' && !$isNew) {
        $targetTermId = input('target_term_id');
        if (!$targetTermId) {
            flash('error', 'Pick a target term.');
            redirect('fees/schedules/edit?id=' . $scheduleId);
        }
        if ($targetTermId === $schedule['term_id']) {
            flash('error', 'Target term must be different from this schedule\'s term.');
            redirect('fees/schedules/edit?id=' . $scheduleId);
        }

        // Check the unique constraint won't blow up
        $dup = $sb->from('fee_groups')->select('id')
            ->eq('school_id', $sid)
            ->eq('class_id', $schedule['class_id'])
            ->eq('term_id', $targetTermId)
            ->single()->execute();
        if (!empty($dup['data'])) {
            flash('error', 'A schedule already exists for this class in the target term.');
            redirect('fees/schedules/edit?id=' . $scheduleId);
        }

        // Get target term's academic_year_id (in case it differs)
        $targetTerm = $termMap[$targetTermId] ?? null;
        $targetYearId = $targetTerm['academic_year_id'] ?? $schedule['academic_year_id'];

        // Build new name: replace term name in old name, or append target term name
        $oldTermName = $termMap[$schedule['term_id']]['name'] ?? '';
        $newTermName = $targetTerm['name'] ?? '';
        $newName = $oldTermName && str_contains($schedule['name'], $oldTermName)
            ? str_replace($oldTermName, $newTermName, $schedule['name'])
            : $schedule['name'] . ' — ' . $newTermName;

        // Insert the new schedule
        $newRes = $sb->from('fee_groups')->insert([
            'school_id'        => $sid,
            'name'             => $newName,
            'description'      => $schedule['description'],
            'class_id'         => $schedule['class_id'],
            'term_id'          => $targetTermId,
            'academic_year_id' => $targetYearId,
            'billing_cycle'    => $schedule['billing_cycle'],
            'is_active'        => true,
        ]);

        if ($newRes['error']) {
            flash('error', 'Roll forward failed: ' . $newRes['error']);
            redirect('fees/schedules/edit?id=' . $scheduleId);
        }
        $newId = $newRes['data'][0]['id'] ?? null;

        // Clone the line items
        if ($newId && !empty($items)) {
            foreach ($items as $it) {
                $sb->from('fee_group_items')->insert([
                    'fee_group_id' => $newId,
                    'fee_head_id'  => $it['fee_head_id'],
                    'amount'       => $it['amount'],
                    'sort_order'   => $it['sort_order'] ?? 0,
                ]);
            }
        }

        auditLog('roll_forward', 'fee_group', $newId, [
            'source_id'     => $scheduleId,
            'source_term'   => $schedule['term_id'],
            'target_term'   => $targetTermId,
            'items_cloned'  => count($items),
        ]);

        flash('success', 'Schedule rolled forward to ' . e($newTermName) . '. You can now edit the new schedule.');
        redirect('fees/schedules/edit?id=' . $newId);
    }

    // ── DELETE ─────────────────────────────────────────────────
    if ($action === 'delete' && !$isNew) {
        // Check no invoices reference this schedule
        $invCheck = $sb->from('invoices')->select('id')
            ->eq('fee_group_id', $scheduleId)->limit(1)->execute();
        if (!empty($invCheck['data'])) {
            flash('error', 'Cannot delete: invoices reference this schedule. Mark it inactive instead.');
            redirect('fees/schedules/edit?id=' . $scheduleId);
        }
        // Cascade deletes fee_group_items via FK
        $sb->from('fee_groups')->eq('id', $scheduleId)->eq('school_id', $sid)->delete();
        auditLog('delete', 'fee_group', $scheduleId);
        flash('success', 'Schedule deleted.');
        redirect('fees/schedules');
    }

    // ── SAVE (insert or update) ────────────────────────────────
    if ($action === 'save') {
        $classId   = input('class_id');
        $termId    = input('term_id');
        $name      = trim(input('name'));
        $desc      = trim(input('description'));
        $cycle     = input('billing_cycle') ?: 'termly';
        $isActive  = input('is_active') === '1';

        if (!$classId || !$termId || $name === '') {
            flash('error', 'Class, term, and name are required.');
            redirect($isNew ? 'fees/schedules/edit' : 'fees/schedules/edit?id=' . $scheduleId);
        }

        // Resolve academic_year_id from term
        $term = $termMap[$termId] ?? null;
        $yearId = $term['academic_year_id'] ?? null;

        if ($isNew) {
            // Check unique constraint won't blow up
            $dup = $sb->from('fee_groups')->select('id')
                ->eq('school_id', $sid)->eq('class_id', $classId)->eq('term_id', $termId)
                ->single()->execute();
            if (!empty($dup['data'])) {
                flash('error', 'A schedule already exists for this class in this term. Edit that one instead.');
                redirect('fees/schedules');
            }

            $createRes = $sb->from('fee_groups')->insert([
                'school_id'        => $sid,
                'name'             => $name,
                'description'      => $desc ?: null,
                'class_id'         => $classId,
                'term_id'          => $termId,
                'academic_year_id' => $yearId,
                'billing_cycle'    => $cycle,
                'is_active'        => $isActive,
            ]);
            if ($createRes['error']) {
                flash('error', 'Save failed: ' . $createRes['error']);
                redirect('fees/schedules/edit');
            }
            $scheduleId = $createRes['data'][0]['id'] ?? null;
            auditLog('create', 'fee_group', $scheduleId);
        } else {
            // Update — keep class/term as-is to honor unique constraint
            $sb->from('fee_groups')->eq('id', $scheduleId)->eq('school_id', $sid)->update([
                'name'          => $name,
                'description'   => $desc ?: null,
                'billing_cycle' => $cycle,
                'is_active'     => $isActive,
                'updated_at'    => date('c'),
            ]);
            auditLog('update', 'fee_group', $scheduleId);
        }

        // Replace line items: delete existing, insert from form
        $sb->from('fee_group_items')->eq('fee_group_id', $scheduleId)->delete();

        $itemFeeHeadIds = $_POST['item_fee_head_id'] ?? [];
        $itemAmounts    = $_POST['item_amount']      ?? [];
        $insertedCount = 0;
        for ($i = 0; $i < count($itemFeeHeadIds); $i++) {
            $fhId = $itemFeeHeadIds[$i] ?? '';
            $amt  = (float)($itemAmounts[$i] ?? 0);
            if (!$fhId || $amt < 0) continue;
            $sb->from('fee_group_items')->insert([
                'fee_group_id' => $scheduleId,
                'fee_head_id'  => $fhId,
                'amount'       => $amt,
                'sort_order'   => $i,
            ]);
            $insertedCount++;
        }

        flash('success', $isNew ? 'Schedule created with ' . $insertedCount . ' item(s).' : 'Schedule updated.');
        redirect('fees/schedules/edit?id=' . $scheduleId);
    }
}

// ── For roll-forward UI: list terms that don't already have a schedule for this class
$availableTermsForRollForward = [];
if (!$isNew && !empty($schedule['class_id'])) {
    $existingForClass = $sb->from('fee_groups')->select('term_id')
        ->eq('school_id', $sid)->eq('class_id', $schedule['class_id'])->execute();
    $usedTermIds = array_column($existingForClass['data'] ?? [], 'term_id');
    foreach ($terms as $t) {
        if (!in_array($t['id'], $usedTermIds)) {
            $availableTermsForRollForward[] = $t;
        }
    }
}

// Build fee head map for dropdown.
// Each option carries:
//   - data-amount   → for auto-filling the schedule amount field
//   - data-class-id → for filtering to fee heads that apply to the picked class
//                     (NULL class_id means "applies to all classes")
$feeHeadOptions    = '';
$feeHeadAmounts    = []; // id => amount, exposed to JS for newly-added rows
$feeHeadClassIds   = []; // id => class_id or '' for "all classes"
foreach ($feeHeads as $fh) {
    $amt  = (float)($fh['amount'] ?? 0);
    $fhCi = $fh['class_id'] ?? '';
    $feeHeadAmounts[$fh['id']]  = $amt;
    $feeHeadClassIds[$fh['id']] = $fhCi;

    // Show the class hint inline so the user understands what they're picking
    $classHint = '';
    if ($fhCi && isset($classMap[$fhCi])) {
        $classHint = ' [' . $classMap[$fhCi] . ']';
    } elseif (!$fhCi) {
        $classHint = ' [All]';
    }
    $amtHint = $amt > 0 ? ' — ' . number_format($amt, 2) : '';
    $feeHeadOptions .= '<option value="' . e($fh['id']) . '"'
        . ' data-amount="' . $amt . '"'
        . ' data-class-id="' . e($fhCi) . '">'
        . e($fh['name']) . $classHint . $amtHint
        . '</option>';
}

require __DIR__ . '/../../includes/layout-top.php';
?>

<div class="mb-6">
    <a href="<?= baseUrl('fees/schedules') ?>" class="text-sm text-gray-500 hover:text-emerald-600">&larr; Back to Schedules</a>
    <h1 class="text-2xl font-bold text-gray-900 mt-2">
        <?= $isNew ? 'New Fee Schedule' : 'Edit Schedule' ?>
    </h1>
    <?php if (!$isNew): ?>
        <p class="text-sm text-gray-500 mt-1">
            <?= e($classMap[$schedule['class_id']] ?? 'Unknown class') ?>
            <span class="text-gray-300 mx-1.5">·</span>
            <?= e($termMap[$schedule['term_id']]['name'] ?? 'No term') ?>
        </p>
    <?php endif; ?>
</div>

<form method="POST" class="max-w-4xl">
    <?= csrfField() ?>
    <input type="hidden" name="action" value="save">

    <!-- Schedule Meta -->
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
        <h2 class="text-base font-semibold text-gray-900 mb-4">Schedule Details</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                <?php if ($isNew): ?>
                    <select name="class_id" required
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Choose class</option>
                        <?php foreach ($classes as $c): ?>
                            <option value="<?= e($c['id']) ?>"><?= e($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                <?php else: ?>
                    <input type="hidden" name="class_id" value="<?= e($schedule['class_id']) ?>">
                    <div class="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
                        <?= e($classMap[$schedule['class_id']] ?? '— unknown') ?>
                        <span class="text-xs text-gray-400 ml-2">(locked after creation)</span>
                    </div>
                <?php endif; ?>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                <?php if ($isNew): ?>
                    <select name="term_id" required
                            class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                        <option value="">Choose term</option>
                        <?php foreach ($terms as $t): ?>
                            <option value="<?= e($t['id']) ?>"<?= !empty($t['is_current']) ? ' selected' : '' ?>>
                                <?= e($t['name']) ?><?= !empty($t['is_current']) ? ' (active)' : '' ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                <?php else: ?>
                    <input type="hidden" name="term_id" value="<?= e($schedule['term_id']) ?>">
                    <div class="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
                        <?= e($termMap[$schedule['term_id']]['name'] ?? '— unknown') ?>
                        <span class="text-xs text-gray-400 ml-2">(use Roll Forward to copy to another term)</span>
                    </div>
                <?php endif; ?>
            </div>

            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Schedule Name *</label>
                <input type="text" name="name" required
                       value="<?= e($schedule['name'] ?? '') ?>"
                       placeholder="e.g. Grade 2 — Term 2 2026"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description"
                       value="<?= e($schedule['description'] ?? '') ?>"
                       placeholder="Optional — e.g. Day Scholar standard fees"
                       class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
                <select name="billing_cycle"
                        class="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                    <?php foreach (['termly','monthly','quarterly','semi_annually','annually','one_time'] as $bc): ?>
                        <option value="<?= $bc ?>"<?= ($schedule['billing_cycle'] ?? 'termly') === $bc ? ' selected' : '' ?>>
                            <?= ucfirst(str_replace('_', ' ', $bc)) ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="flex items-center pt-7">
                <label class="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="is_active" value="1"<?= ($isNew || ($schedule['is_active'] ?? false)) ? ' checked' : '' ?>
                           class="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500">
                    <span class="text-sm text-gray-700">Active (available for invoicing)</span>
                </label>
            </div>
        </div>
    </div>

    <!-- Line Items -->
    <div class="bg-white rounded-xl border border-gray-100 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-base font-semibold text-gray-900">Fee Items</h2>
                <p class="text-xs text-gray-500 mt-0.5">Pick fee heads and amounts for this schedule.</p>
            </div>
            <button type="button" onclick="addItemRow()"
                    class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                + Add Item
            </button>
        </div>

        <?php if (empty($feeHeads)): ?>
            <div class="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <strong>No fee heads defined yet.</strong>
                <p class="mt-1">Go to <a href="<?= baseUrl('fees/heads') ?>" class="text-amber-900 underline font-medium">Fee Heads</a> first to create reusable fee items (Tuition, Lunch, etc.).</p>
            </div>
        <?php else: ?>
            <div id="itemsTable">
                <div class="grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-gray-500 px-1">
                    <div class="col-span-7">Fee Head</div>
                    <div class="col-span-4 text-right">Amount (KSh)</div>
                    <div class="col-span-1"></div>
                </div>

                <?php if (empty($items)): ?>
                    <!-- Render one empty row. Amount auto-fills from the picked fee head's default. -->
                    <div class="grid grid-cols-12 gap-3 mb-2 item-row">
                        <select name="item_fee_head_id[]" onchange="fillAmountFromHead(this)"
                                class="col-span-7 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                            <option value="">Select fee head…</option>
                            <?= $feeHeadOptions ?>
                        </select>
                        <input type="number" name="item_amount[]" step="0.01" min="0" placeholder="Auto from fee head"
                               class="col-span-4 px-3 py-2 text-right rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                        <button type="button" onclick="removeItemRow(this)"
                                class="col-span-1 text-gray-400 hover:text-red-500 text-sm"></button>
                    </div>
                <?php else: ?>
                    <?php foreach ($items as $it): ?>
                        <div class="grid grid-cols-12 gap-3 mb-2 item-row">
                            <select name="item_fee_head_id[]" onchange="fillAmountFromHead(this)"
                                    class="col-span-7 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                                <option value="">Select fee head…</option>
                                <?php foreach ($feeHeads as $fh): ?>
                                    <option value="<?= e($fh['id']) ?>" data-amount="<?= (float)($fh['amount'] ?? 0) ?>"<?= $fh['id'] === $it['fee_head_id'] ? ' selected' : '' ?>>
                                        <?= e($fh['name']) ?><?= (float)($fh['amount'] ?? 0) > 0 ? ' — ' . number_format((float)$fh['amount'], 2) : '' ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <input type="number" name="item_amount[]" step="0.01" min="0"
                                   value="<?= e((string)$it['amount']) ?>" placeholder="Auto from fee head"
                                   class="col-span-4 px-3 py-2 text-right rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                            <button type="button" onclick="removeItemRow(this)"
                                    class="col-span-1 text-gray-400 hover:text-red-500 text-sm"></button>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>

    <!-- Save / Cancel -->
    <div class="flex items-center gap-3 mb-4">
        <button type="submit"
                class="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition">
            <?= $isNew ? 'Create Schedule' : 'Save Changes' ?>
        </button>
        <a href="<?= baseUrl('fees/schedules') ?>"
           class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Cancel
        </a>
    </div>
</form>

<?php if (!$isNew): ?>
<!-- Roll Forward + Delete (separate forms) -->
<div class="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

    <div class="bg-white rounded-xl border border-emerald-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-sm font-semibold text-emerald-800 mb-1">Roll Forward to Next Term</h3>
        <p class="text-xs text-gray-500 mb-3">Clones this schedule (and all its line items) into another term. Edit the new copy for any changes.</p>
        <?php if (empty($availableTermsForRollForward)): ?>
            <p class="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">No terms available — every term already has a schedule for this class.</p>
        <?php else: ?>
            <form method="POST" class="flex items-center gap-2"
                  onsubmit="return confirm('Roll this schedule forward to the selected term?')">
                <?= csrfField() ?>
                <input type="hidden" name="action" value="roll_forward">
                <select name="target_term_id" required
                        class="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                    <option value="">Select target term…</option>
                    <?php foreach ($availableTermsForRollForward as $t): ?>
                        <option value="<?= e($t['id']) ?>"><?= e($t['name']) ?></option>
                    <?php endforeach; ?>
                </select>
                <button type="submit"
                        class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap">
                    Roll Forward
                </button>
            </form>
        <?php endif; ?>
    </div>

    <div class="bg-white rounded-xl border border-red-100 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 class="text-sm font-semibold text-red-800 mb-1">Delete Schedule</h3>
        <p class="text-xs text-gray-500 mb-3">Only allowed if no invoices reference this schedule. Otherwise, mark it inactive instead.</p>
        <form method="POST"
              onsubmit="return confirm('Delete this schedule and all its line items? This cannot be undone.')">
            <?= csrfField() ?>
            <input type="hidden" name="action" value="delete">
            <button type="submit"
                    class="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition">
                Delete Schedule
            </button>
        </form>
    </div>

</div>
<?php endif; ?>

<!-- JS for line items -->
<?php if (!empty($feeHeads)): ?>
<script>
// Fee head id => default amount, so newly-added rows auto-fill the same way
// the static ones do.
const feeHeadAmounts  = <?= jsonHtml($feeHeadAmounts) ?>;
// Fee head id => its class_id ('' means "applies to all classes")
const feeHeadClassIds = <?= jsonHtml($feeHeadClassIds) ?>;

// Get the currently-selected class for THIS schedule.
// For a locked (existing) schedule we read the hidden input; for a new one we
// read the select. Either way, we return one value.
function currentScheduleClassId() {
    const sel = document.querySelector('select[name="class_id"]')
              || document.querySelector('input[name="class_id"]');
    return sel ? sel.value : '';
}

// Filter fee head <option>s in a given <select> to those applicable to the
// picked class: keep options where class_id is empty (applies to all) or
// matches the schedule's class. Hide the rest. If the currently-picked option
// no longer applies, clear it.
function filterFeeHeadSelect(sel) {
    const wanted = currentScheduleClassId();
    let cleared = false;
    Array.from(sel.options).forEach(opt => {
        if (!opt.value) return; // keep the placeholder
        const ci = opt.dataset.classId || '';
        const ok = (ci === '' || ci === wanted);
        opt.hidden   = !ok;
        opt.disabled = !ok;
        if (!ok && sel.value === opt.value) {
            sel.value = '';
            cleared = true;
        }
    });
    if (cleared) {
        // Also clear the adjacent amount so the user doesn't carry an orphan
        const row = sel.closest('.item-row');
        const amt = row && row.querySelector('input[name="item_amount[]"]');
        if (amt) amt.value = '';
    }
}

// Apply the filter to every existing fee-head select on the page.
function refilterAllFeeHeadSelects() {
    document.querySelectorAll('select[name="item_fee_head_id[]"]').forEach(filterFeeHeadSelect);
}

// Re-filter whenever the class picker changes (new-schedule case only —
// existing schedules have class locked).
document.addEventListener('change', function(e) {
    if (e.target && e.target.name === 'class_id') refilterAllFeeHeadSelects();
});

// Apply once on initial load so the user sees the filtered list immediately.
refilterAllFeeHeadSelects();

function addItemRow() {
    const tpl = `
        <div class="grid grid-cols-12 gap-3 mb-2 item-row">
            <select name="item_fee_head_id[]" onchange="fillAmountFromHead(this)"
                    class="col-span-7 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                <option value="">Select fee head…</option>
                <?= str_replace(["\n","\r"], '', addslashes($feeHeadOptions)) ?>
            </select>
            <input type="number" name="item_amount[]" step="0.01" min="0" placeholder="Auto from fee head"
                   class="col-span-4 px-3 py-2 text-right rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
            <button type="button" onclick="removeItemRow(this)"
                    class="col-span-1 text-gray-400 hover:text-red-500 text-sm"></button>
        </div>`;
    document.getElementById('itemsTable').insertAdjacentHTML('beforeend', tpl);
    // Immediately filter the new row to the picked class.
    refilterAllFeeHeadSelects();
}
function removeItemRow(btn) {
    btn.closest('.item-row').remove();
}

// When the user picks a fee head, fill in the adjacent amount field with the
// fee head's default. We only overwrite if the user hasn't typed something
// custom — that way, editing an existing row doesn't blow away a manual
// override.
function fillAmountFromHead(sel) {
    const row = sel.closest('.item-row');
    if (!row) return;
    const amountInput = row.querySelector('input[name="item_amount[]"]');
    if (!amountInput) return;
    const headId = sel.value;
    const def    = feeHeadAmounts[headId];
    // Overwrite if blank OR if the user clearly hadn't touched it (0 or empty)
    const current = parseFloat(amountInput.value);
    if (!amountInput.value || !Number.isFinite(current) || current === 0) {
        if (Number.isFinite(def) && def > 0) {
            amountInput.value = def.toFixed(2);
        }
    }
}
</script>
<?php endif; ?>

<?php require __DIR__ . '/../../includes/layout-bottom.php'; ?>
