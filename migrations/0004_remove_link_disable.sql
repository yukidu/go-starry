-- 移除前台停用功能後，將既有停用連結全部恢復為可用。
UPDATE short_links
SET status = 'active', updated_at = datetime('now')
WHERE status <> 'active';
