(function (root) {
  'use strict';
  function fixture(size, startYear, endYear) {
    const state = root.KPT.empty();
    state.Catalog.push({ id: 'CAT-PRO-1', version: 1, kind: 'Award', category: 'Probadge', name: 'First Aid Proficiency', level: 'Cadet', archived: false });
    state.Catalog.push({ id: 'CAT-PROM-1', version: 1, kind: 'Award', category: 'Promotion', name: 'Cadet Promotion', level: 'Corporal', archived: false });
    for (let index = 1; index <= size; index++) {
      const id = 'STU-' + String(index).padStart(6, '0');
      const member = { id, version: 1, name: 'Sample Member ' + String(index).padStart(3, '0'), ic: '000000-00-' + String(index).padStart(4, '0'), sjamId: index % 9 === 0 ? '' : '0' + (10000 + index), race: 'Sample', form: String(1 + index % 5), joined: startYear + '-01-15', status: index % 10 === 0 ? 'Graduated' : index % 17 === 0 ? 'Withdrawn' : 'Active' };
      state.Members.push(member);
      for (let year = startYear; year <= endYear; year++) {
        state.Enrolments.push({ id: 'ENR-' + index + '-' + year, version: 1, memberId: id, year, form: String(1 + (index + year - startYear) % 5), status: year === endYear ? member.status : 'Active' });
        state.Duty.push({ id: 'DUT-' + index + '-' + year, version: 1, memberId: id, year, hours: index % 7 === 0 ? null : index % 3 === 0 ? 59.5 : 60 + index % 20 });
        if (index % 4 === 0 || index === 1) state.Awards.push({ id: 'AWA-' + index + '-' + year, version: 1, memberId: id, category: 'Probadge', name: 'First Aid Proficiency', date: year + '-11-01', level: 'Cadet', certificate: 'SAMPLE-' + year + '-' + index, notes: 'Fictional preview only', archived: false });
      }
    }
    for (let year = startYear; year <= endYear; year++) {
      for (let meeting = 1; meeting <= 12; meeting++) {
        const activity = { id: 'ACT-' + year + '-' + meeting, version: 1, name: meeting === 12 ? 'Annual Inspection & DIM' : 'Divisional Instructional Meeting ' + meeting, date: year + '-' + String(meeting).padStart(2, '0') + '-10', tags: meeting === 12 ? ['DIM', 'Inspection'] : ['DIM'], examType: '', archived: false };
        state.Activities.push(activity);
        state.Members.forEach((member, index) => state.Attendance.push({ id: 'ATT-' + year + '-' + meeting + '-' + index, version: 1, activityId: activity.id, memberId: member.id, present: index % 5 !== 4 || meeting < 11 }));
      }
      const activity = { id: 'ACT-' + year + '-EXAM', version: 1, name: 'BFA Examination', date: year + '-09-20', tags: ['Exam'], examType: 'BFA', archived: false };
      state.Activities.push(activity);
      state.Members.forEach((member, index) => {
        const attended = index % 11 !== 10;
        state.Attendance.push({ id: 'ATT-EX-' + year + '-' + index, version: 1, activityId: activity.id, memberId: member.id, present: attended });
        state.Exams.push({ id: 'EXA-' + year + '-' + index, version: 1, memberId: member.id, activityId: activity.id, type: 'BFA', date: activity.date, result: attended ? index % 13 === 0 ? 'Fail' : 'Pass' : 'Absent', attended, certificate: attended ? 'SAMPLE-CERT-' + year + '-' + index : '', archived: false });
      });
    }
    state.sequence = size;
    state.revision = 1;
    state.updatedAt = endYear + '-10-01T02:00:00.000Z';
    state.audit = [{ at: state.updatedAt, actor: 'preview-owner@example.test', action: 'Fictional preview dataset', revision: 1 }];
    return state;
  }
  root.KPTDemo = { fixture };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTDemo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
