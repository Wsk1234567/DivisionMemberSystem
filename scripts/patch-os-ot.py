from pathlib import Path

p = Path('src/domain.js')
text = p.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(label + ' not found')
    text = text.replace(old, new, 1)

replace_once(
    """        if (table === 'FinBooks') {
          if (!row.activityName) fail('Activity name is required.');
        }""",
    """        if (table === 'FinBooks') {
          if (!row.activityName) fail('Activity name is required.');
          const status = str(row.status || 'Draft');
          if (!finStatuses.includes(status)) fail('Invalid finance approval status.');
        }""",
    'FinBooks block')

replace_once(
    """          if (row.ocEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(row.ocEmail)) fail('Organizing Chairman email is invalid.');
        }
        if (table === 'DocItems') {""",
    """          ['ocEmail', 'osEmail', 'otEmail'].forEach(emailKey => {
            if (row[emailKey] && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(row[emailKey])) fail('Organizing role email is invalid.');
          });
        }
        if (table === 'DocItems') {""",
    'DocPackages emails')

replace_once(
    """      ocEmail: str(request.ocEmail).toLowerCase(),
      createdBy: context.actor, createdAt: context.now, approvedAt: '', archived: false""",
    """      ocEmail: str(request.ocEmail).toLowerCase(),
      osEmail: str(request.osEmail).toLowerCase(),
      otEmail: str(request.otEmail).toLowerCase(),
      createdBy: context.actor, createdAt: context.now, approvedAt: '', archived: false""",
    'createDocPackage emails')

replace_once(
    """    const ocEmail = str(request.ocEmail === undefined ? pkg.ocEmail : request.ocEmail).toLowerCase();
    if (ocEmail && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(ocEmail)) fail('Organizing Chairman email is invalid.');
    const updated = upsert(state, 'DocPackages', Object.assign({}, pkg, { eventDate, ocEmail }), context.uuid);""",
    """    const ocEmail = str(request.ocEmail === undefined ? pkg.ocEmail : request.ocEmail).toLowerCase();
    const osEmail = str(request.osEmail === undefined ? pkg.osEmail : request.osEmail).toLowerCase();
    const otEmail = str(request.otEmail === undefined ? pkg.otEmail : request.otEmail).toLowerCase();
    [['ocEmail', ocEmail], ['osEmail', osEmail], ['otEmail', otEmail]].forEach(([key, value]) => {
      if (value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) fail('Organizing role email is invalid.');
    });
    const updated = upsert(state, 'DocPackages', Object.assign({}, pkg, { eventDate, ocEmail, osEmail, otEmail }), context.uuid);""",
    'saveDocPackageMeta emails')

replace_once(
    """    const canStructure = request.canEditStructure !== false;""",
    """    const canStructure = request.canEditStructure !== false;
    const canEditDue = request.canEditDue !== false;""",
    'canEditDue')

replace_once(
    """      if (!canStructure) {
        // OC: due date (and sort if provided) only — not title/role/required
        next.title = item.title;
        next.role = item.role;
        next.required = item.required;
      }""",
    """      if (!canStructure) {
        next.title = item.title;
        next.role = item.role;
        next.required = item.required;
      }
      if (!canEditDue) {
        next.dueOffsetDays = item.dueOffsetDays;
      }""",
    'due lock')

p.write_text(text, encoding='utf-8')
print('domain field patches ok')
