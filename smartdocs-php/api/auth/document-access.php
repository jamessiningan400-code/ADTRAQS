<?php
require_once __DIR__ . '/session.php';

function adtraqsGetDocumentAccessUser(PDO $pdo): ?array
{
    $user = adtraqsGetSessionUser($pdo);
    if (!$user) {
        return null;
    }

    $normalizedOffice = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $user['office']));
    $officeCodes = [
        'ca' => 'CA',
        'cityadministrator' => 'CA',
        'cityadministrativeoffice' => 'CA',
        'cityadministratoroffice' => 'CA',
        'cityadministratorsoffice' => 'CA',
        'cityadminoffice' => 'CA',
        'cityadminsoffice' => 'CA',
        'officeofthecityadministrator' => 'CA',
        'cto' => 'CTO',
        'citytreasureroffice' => 'CTO',
        'citytreasurersoffice' => 'CTO',
        'cbo' => 'CBO',
        'citybudgetoffice' => 'CBO',
        'cao' => 'CAO',
        'cityaccountingoffice' => 'CAO',
        'cityaccountantoffice' => 'CAO',
        'cityaccountantsoffice' => 'CAO',
        'processor' => 'PRC',
        'processors' => 'PRC',
    ];

    return [
        'id' => (int) $user['id'],
        'role' => (string) $user['role'],
        'officeCode' => $officeCodes[$normalizedOffice] ?? trim((string) $user['office']),
        'officeName' => trim((string) $user['office']),
    ];
}

function adtraqsIsCityAdminOfficeName(string $office): bool
{
    $normalizedOffice = strtolower(preg_replace('/[^a-z0-9]/i', '', $office));
    return in_array($normalizedOffice, [
        'ca',
        'cityadministrator',
        'cityadministrativeoffice',
        'cityadministratoroffice',
        'cityadministratorsoffice',
        'cityadminoffice',
        'cityadminsoffice',
        'officeofthecityadministrator',
    ], true);
}

function adtraqsCityAdminOfficeSqlCondition(string $officeExpression): string
{
    $normalizedOffice = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        LOWER(TRIM({$officeExpression})), ' ', ''), CHAR(39), ''), '-', ''), '.', ''), '_', '')";
    return "{$normalizedOffice} IN (
        'ca', 'cityadmin', 'cityadministrator', 'cityadministrative',
        'cityadministrativeoffice', 'cityadministratoroffice', 'cityadministratorsoffice',
        'cityadminoffice', 'cityadminsoffice', 'officeofthecityadministrator'
    )";
}

function adtraqsOfficeOwnerAccessSqlCondition(string $officeExpression): string
{
    return "(
        (? = 'CA' AND " . adtraqsCityAdminOfficeSqlCondition($officeExpression) . ")
        OR LOWER(TRIM({$officeExpression})) = LOWER(TRIM(?))
    )";
}

function adtraqsNormalizeTrackingOffice(PDO $pdo, string $office): ?string
{
    $office = trim($office);
    if ($office === '') {
        return null;
    }

    $normalizedOffice = strtolower(preg_replace('/[^a-z0-9]/i', '', $office));
    $officeCodes = [
        'ca' => 'CA',
        'cityadministrator' => 'CA',
        'cityadministrativeoffice' => 'CA',
        'cityadministratoroffice' => 'CA',
        'cityadministratorsoffice' => 'CA',
        'cityadminoffice' => 'CA',
        'cityadminsoffice' => 'CA',
        'officeofthecityadministrator' => 'CA',
        'cto' => 'CTO',
        'citytreasureroffice' => 'CTO',
        'citytreasurersoffice' => 'CTO',
        'cbo' => 'CBO',
        'citybudgetoffice' => 'CBO',
        'cao' => 'CAO',
        'cityaccountingoffice' => 'CAO',
        'cityaccountantoffice' => 'CAO',
        'cityaccountantsoffice' => 'CAO',
        'processor' => 'PRC',
        'processors' => 'PRC',
    ];
    if (isset($officeCodes[$normalizedOffice])) {
        return $officeCodes[$normalizedOffice];
    }

    $stmt = $pdo->prepare('SELECT name FROM offices WHERE name = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$office]);
    $configuredOffice = $stmt->fetchColumn();
    if (!$configuredOffice) {
        return null;
    }

    $normalizedConfiguredOffice = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $configuredOffice));
    return $officeCodes[$normalizedConfiguredOffice] ?? (string) $configuredOffice;
}

function adtraqsDocumentVisibilitySql(string $documentAlias = 'd'): string
{
    return "(
        (
            EXISTS (
                SELECT 1
                FROM users access_owner
                WHERE access_owner.id = {$documentAlias}.created_by
                  AND " . adtraqsOfficeOwnerAccessSqlCondition('access_owner.office') . "
            )
        )
        OR EXISTS (
            SELECT 1
            FROM tracking_steps access_ts
            WHERE access_ts.id = (
                SELECT latest_ts.id
                FROM tracking_steps latest_ts
                INNER JOIN tracking_records latest_tr ON latest_tr.id = latest_ts.tracking_id
                WHERE latest_tr.document_id = {$documentAlias}.id
                ORDER BY latest_ts.id DESC
                LIMIT 1
            )
              AND (
                  (access_ts.forwarded_at IS NOT NULL AND access_ts.forwarded_to = ?)
                  OR (access_ts.forwarded_at IS NULL AND access_ts.office_code = ?)
              )
        )
    )";
}

function adtraqsDocumentVisibilityParams(array $user): array
{
    return [
        $user['officeCode'],
        $user['officeName'],
        $user['officeCode'],
        $user['officeCode'],
    ];
}
