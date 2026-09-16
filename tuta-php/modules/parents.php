<?php
/**
 * Parent Accounts — onboard parents onto the portal.
 * Students are grouped into families (shared family_id); the admin invites
 * one parent per family. The invitation carries the children's ids, so
 * accepting it links the parent to exactly those students.
 */
$pageTitle = 'Parent Accounts';
$sb  = new Supabase();
$sid = schoolId();

if (isPost() && verifyCsrf()) {
    $action = input('action');

    if ($action === 'invite_parent') {
        $email      = strtolower(trim(input('parent_email')));
        $studentIds = input('student_ids'); // comma-separated
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('error', 'A valid email address is required.');
        } elseif (!$studentIds) {
            flash('error', 'No children were selected for this parent.');
        } else {
            $token  = bin2hex(random_bytes(24));
            $school = cachedSchool();
            $user   = currentUser();
            $res = $sb->from('invitations')->insert([
                'email'            => $email,
                'school_id'        => $sid,
                'school_name'      => $school['name'] ?? '',
                'role'             => 'parent',
                'token'            => $token,
                'invited_by'       => $user['id'] ?? null,
                'link_student_ids' => $studentIds,
            ]);
            if (!empty($res['error'])) {
                flash('error', 'Could not create invitation: ' . $res['error']);
            } else {
                $mail = sendInvitationEmail($email, $school['name'] ?? '', 'parent', inviteUrl($token, currentTenantBaseUrl()));
                if ($mail['ok']) {
                    flash('success', 'Parent invitation emailed to ' . $email . '.');
                } else {
                    flash('success', 'Parent invitation created for ' . $email . '. '
                        . (mailEnabled()
                            ? 'The email could not be sent (' . $mail['error'] . ') — '
                            : 'Automatic email is off — ')
                        . 'copy the link below and send it to them.');
                }
            }
        }
        redirect('parents');
    }

    if ($action === 'cancel_invitation') {
        $invId = input('invitation_id');
        $sb->from('invitations')->eq('id', $invId)->eq('school_id', $sid)->eq('role', 'parent')->delete();
        flash('success', 'Invitation cancelled.');
        redirect('parents');
    }
}

// Active students
$stuRes = $sb->from('students')
    ->select('id,first_name,last_name,guardian_name,guardian_phone,family_id,current_class_id')
    ->eq('school_id', $sid)->eq('status', 'active')->order('first_name')->execute();
$students = $stuRes['data'] ?? [];

// Group students into families (shared family_id; otherwise each is its own)
$families = [];
foreach ($students as $s) {
    $key = !empty($s['family_id']) ? 'fam:' . $s['family_id'] : 'stu:' . $s['id'];
    if (!isset($families[$key])) {
        $families[$key] = ['guardian_name' => '', 'guardian_phone' => '', 'children' => []];
    }
    $families[$key]['children'][] = $s;
    if ($families[$key]['guardian_name'] === '' && !empty($s['guardian_name'])) {
        $families[$key]['guardian_name'] = $s['guardian_name'];
    }
    if ($families[$key]['guardian_phone'] === '' && !empty($s['guardian_phone'])) {
        $families[$key]['guardian_phone'] = $s['guardian_phone'];
    }
}

// Which students already have a parent account linked
$allStudentIds   = array_column($students, 'id');
$linkedStudents  = [];
if (!empty($allStudentIds)) {
    $spRes = $sb->from('student_parents')->select('student_id')
        ->eq('school_id', $sid)->in('student_id', $allStudentIds)->execute();
    foreach (($spRes['data'] ?? []) as $sp) $linkedStudents[$sp['student_id']] = true;
}

// Pending parent invitations
$invRes = $sb->from('invitations')
    ->select('id,email,token,accepted_at,expires_at,created_at')
    ->eq('school_id', $sid)->eq('role', 'parent')->is('accepted_at', 'null')
    ->order('created_at', false)->execute();
$pendingInvites = $invRes['data'] ?? [];

$classMap = cachedClassMap();
$appUrl   = defined('APP_URL') ? rtrim(APP_URL, '/') : '';

$familyCount = count($families);
$linkedCount = 0;
foreach ($families as $fam) {
    $allLinked = !empty($fam['children']);
    foreach ($fam['children'] as $ch) {
        if (empty($linkedStudents[$ch['id']])) { $allLinked = false; break; }
    }
    if ($allLinked) $linkedCount++;
}

require __DIR__ . '/../includes/layout-top.php';
?>

<div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900">Parent Accounts</h1>
    <p class="text-sm text-gray-500 mt-1">Invite parents to the portal — each sees only their own children's fees and report cards</p>
</div>

<div class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-sm text-gray-600">
    <span class="font-medium text-gray-900"><?= $familyCount ?></span> famil<?= $familyCount === 1 ? 'y' : 'ies' ?> ·
    <span class="font-medium text-emerald-600"><?= $linkedCount ?></span> with a parent account ·
    <span class="font-medium text-amber-600"><?= count($pendingInvites) ?></span> invitation<?= count($pendingInvites) !== 1 ? 's' : '' ?> pending
</div>

<?php if (!empty($pendingInvites)): ?>
<div class="bg-white rounded-xl border border-gray-100 p-5 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pending Invitations</h2>
    <div class="space-y-2">
        <?php foreach ($pendingInvites as $inv): ?>
            <?php $inviteLink = $appUrl . '/invite?token=' . urlencode($inv['token'] ?? ''); ?>
            <div class="py-3 px-4 rounded-lg bg-gray-50">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-sm font-medium text-gray-900"><?= e($inv['email']) ?></span>
                    <form method="POST" onsubmit="return confirm('Cancel this invitation?')">
                        <?= csrfField() ?>
                        <input type="hidden" name="action" value="cancel_invitation">
                        <input type="hidden" name="invitation_id" value="<?= e($inv['id']) ?>">
                        <button type="submit" class="text-xs font-medium text-red-500 hover:text-red-700">Cancel</button>
                    </form>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <input type="text" readonly value="<?= e($inviteLink) ?>" onclick="this.select()"
                        class="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 bg-white font-mono">
                    <button type="button"
                        onclick="navigator.clipboard.writeText('<?= e($inviteLink) ?>'); this.textContent='Copied';"
                        class="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition whitespace-nowrap">Copy link</button>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<div class="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <div class="px-5 py-3 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-700">Families</h2>
    </div>
    <?php if (empty($families)): ?>
        <p class="p-8 text-center text-gray-400 text-sm">No active students yet.</p>
    <?php else: ?>
        <div class="divide-y divide-gray-50">
            <?php foreach ($families as $fam): ?>
                <?php
                $childIds  = array_column($fam['children'], 'id');
                $allLinked = !empty($fam['children']);
                foreach ($fam['children'] as $ch) {
                    if (empty($linkedStudents[$ch['id']])) { $allLinked = false; break; }
                }
                ?>
                <div class="px-5 py-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-medium text-gray-900"><?= e($fam['guardian_name'] ?: 'Guardian not named') ?></p>
                            <p class="text-xs text-gray-400"><?= e($fam['guardian_phone'] ?: 'No phone on file') ?></p>
                            <div class="mt-2 flex flex-wrap gap-1.5">
                                <?php foreach ($fam['children'] as $ch): ?>
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-600">
                                        <?= e($ch['first_name'] . ' ' . $ch['last_name']) ?>
                                        <span class="text-gray-400 ml-1"><?= e($classMap[$ch['current_class_id'] ?? ''] ?? '') ?></span>
                                    </span>
                                <?php endforeach; ?>
                            </div>
                        </div>
                        <div class="flex-shrink-0">
                            <?php if ($allLinked): ?>
                                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Parent linked</span>
                            <?php else: ?>
                                <form method="POST" class="flex items-center gap-2">
                                    <?= csrfField() ?>
                                    <input type="hidden" name="action" value="invite_parent">
                                    <input type="hidden" name="student_ids" value="<?= e(implode(',', $childIds)) ?>">
                                    <input type="email" name="parent_email" required placeholder="Parent email"
                                        class="w-48 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-emerald-400 outline-none">
                                    <button type="submit" class="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap">Invite</button>
                                </form>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/../includes/layout-bottom.php'; ?>
