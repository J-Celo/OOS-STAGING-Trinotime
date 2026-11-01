// Shared by the authenticated Worker route and the tenant's SQLite store.
// The caller MUST authorize the conversation before invoking this store helper.
export function historyError(message, status = 400) {
  const error = new Error(message); error.status = status; error.code = 'CHAT_HISTORY_INVALID'; return error;
}
export function historyOptions(params) {
  const limit = Number(params.get('limit') || 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 120) throw historyError('Choose a history page size between 1 and 120.');
  const before = params.get('before') || '';
  const around = params.get('around') || '';
  if (before && around) throw historyError('Use one history position at a time.');
  if (around && !/^[A-Za-z0-9_-]{1,100}$/.test(around)) throw historyError('Invalid message position.');
  let cursor = null;
  if (before) {
    try {
      if (before.length > 400) throw new Error();
      cursor = JSON.parse(atob(before.replace(/-/g, '+').replace(/_/g, '/')));
      if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isSafeInteger(cursor[0]) || cursor[0] < 0 || typeof cursor[1] !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(cursor[1])) throw new Error();
    } catch (_) { throw historyError('Invalid history cursor.'); }
  }
  return {limit, before, around, cursor};
}
const encodeCursor = row => btoa(JSON.stringify([Number(row.created_at), row.message_id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
export function messagePage(sql, conversationId, options, viewerUid = '') {
  const scope='conversation_id = ?'+(viewerUid?' AND NOT EXISTS (SELECT 1 FROM chat_hidden_messages h WHERE h.uid = ? AND h.conversation_id = chat_messages.conversation_id AND h.message_id = chat_messages.message_id)':'');
  return pageRecords(sql, 'chat_messages', 'message_id', scope, [conversationId,...(viewerUid?[viewerUid]:[])], options, 'version');
}
export function replyPage(sql, conversationId, rootMessageId, options, viewerUid = '') {
  const scope='conversation_id = ? AND root_message_id = ?'+(viewerUid?' AND NOT EXISTS (SELECT 1 FROM chat_hidden_replies h WHERE h.uid = ? AND h.conversation_id = chat_replies.conversation_id AND h.root_message_id = chat_replies.root_message_id AND h.reply_id = chat_replies.reply_id)':'');
  return pageRecords(sql, 'chat_replies', 'reply_id', scope, [conversationId, rootMessageId,...(viewerUid?[viewerUid]:[])], options, "COALESCE(json_extract(data, '$._version'), 1)");
}
function pageRecords(sql, table, idColumn, scope, scopeParams, options, versionColumn) {
  const {limit, around, cursor} = options;
  const columns = `data, ${versionColumn} AS version, created_at, ${idColumn} AS message_id`;
  const base = `${scope} AND COALESCE(json_extract(data, '$.deletedAt'), '') = ''`;
  const older = (position, count, inclusive = false) => {
    const condition = position ? ` AND (created_at < ? OR (created_at = ? AND ${idColumn} ${inclusive ? '<=' : '<'} ?))` : '';
    return sql.exec(`SELECT ${columns} FROM ${table} WHERE ${base}${condition} ORDER BY created_at DESC, ${idColumn} DESC LIMIT ?`, ...scopeParams, ...(position ? [position[0], position[0], position[1]] : []), count).toArray();
  };
  let rows, hasOlder = false, hasNewer = false;
  if (around) {
    const target = sql.exec(`SELECT created_at, ${idColumn} AS message_id FROM ${table} WHERE ${base} AND ${idColumn} = ?`, ...scopeParams, around).toArray()[0];
    if (!target) throw historyError('This message is no longer available.', 404);
    const leftCount = Math.max(1, Math.ceil(limit / 2));
    const left = older([target.created_at, target.message_id], leftCount + 1, true);
    const rightCount = limit - leftCount;
    const right = sql.exec(`SELECT ${columns} FROM ${table} WHERE ${base} AND (created_at > ? OR (created_at = ? AND ${idColumn} > ?)) ORDER BY created_at ASC, ${idColumn} ASC LIMIT ?`, ...scopeParams, target.created_at, target.created_at, target.message_id, rightCount + 1).toArray();
    hasOlder = left.length > leftCount; hasNewer = right.length > rightCount;
    rows = [...left.slice(0, leftCount).reverse(), ...right.slice(0, rightCount)];
  } else {
    const found = older(cursor, limit + 1);
    hasOlder = found.length > limit;
    rows = found.slice(0, limit).reverse();
  }
  return {
    messages: rows.map(row => ({...JSON.parse(row.data), _version: Number(row.version || 1)})),
    nextCursor: hasOlder && rows.length ? encodeCursor(rows[0]) : null,
    hasNewer
  };
}
