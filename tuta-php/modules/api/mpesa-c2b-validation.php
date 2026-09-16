<?php
/**
 * M-Pesa C2B Validation — Safaricom calls this BEFORE accepting the payment.
 * We accept all payments (respond with ResultCode 0).
 *
 * Route: ?route=api/mpesa/c2b-validation (public, no auth)
 */
header('Content-Type: application/json');

// Accept all payments — Safaricom requires a quick response
echo json_encode([
    'ResultCode'  => 0,
    'ResultDesc'  => 'Accepted',
]);
