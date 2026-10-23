from pathlib import Path

p = Path('src/domain.js')
text = p.read_text(encoding='utf-8')

old = """    } else if (request.action === 'saveDocTemplate') {
      upsert(state, 'DocTemplates', request.row, context.uuid);
    } else fail('Unsupported action.');"""
new = """    } else if (request.action === 'saveDocTemplate') {
      upsert(state, 'DocTemplates', request.row, context.uuid);
    } else if (request.action === 'submitFinBook') {
      submitFinBook(state, request, context);
    } else if (request.action === 'reviewFinBook') {
      reviewFinBook(state, request, context);
    } else fail('Unsupported action.');"""
if old not in text:
    raise SystemExit('mutate dispatch tail not found')
text = text.replace(old, new, 1)

helpers = '''
  function submitFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.archived) fail('Finance book is archived.');
    if (book.status === 'Approved') fail('This finance book is already approved.');
    if (book.status === 'Submitted') fail('This finance book is already waiting for review.');
    book.status = 'Submitted';
    book.remarks = str(request.remarks || '');
    book.submittedBy = context.actor;
    book.submittedAt = context.now;
    book.reviewedBy = '';
    book.reviewedAt = '';
    book.version++;
  }
  function reviewFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.status !== 'Submitted') fail('Only submitted finance books can be reviewed.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when rejecting.');
    book.status = approve ? 'Approved' : 'Rejected';
    book.remarks = approve ? '' : remarks;
    book.reviewedBy = context.actor;
    book.reviewedAt = context.now;
    book.version++;
  }
'''
anchor = '  function saveFinanceBook(state, request, context) {'
if anchor not in text:
    raise SystemExit('saveFinanceBook not found')
text = text.replace(anchor, helpers + anchor, 1)

p.write_text(text, encoding='utf-8')
print('finance actions ok')
