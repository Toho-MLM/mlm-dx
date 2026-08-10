import { DraftStateSchema, INSTRUMENTS, type DraftState } from '../../../band-draft-state';

export function parseDraftState(value: string): DraftState {
  return DraftStateSchema.parse(JSON.parse(value));
}

export function createInitialDraftState(memberIds: string[], createId: () => string): DraftState {
  const cells: DraftState['cells'] = {};
  for (let index = 1; index <= 3; index += 1) {
    const columnId = createId();
    cells[columnId] = Object.fromEntries(INSTRUMENTS.map((instrument) => [instrument, []]));
  }
  return {
    columns: Object.keys(cells).map((id, index) => ({ id, name: `バンド${index + 1}` })),
    cells, unassignedMemberIds: memberIds, version: 0,
  };
}

export function groupsFromDraft(state: DraftState, createId: () => string) {
  return state.columns.flatMap((column) => {
    const assignments = INSTRUMENTS.flatMap((instrument) =>
      (state.cells[column.id]?.[instrument] ?? []).map((memberId) => ({ instrument, memberId })));
    return assignments.length ? [{ id: createId(), name: '', assignments }] : [];
  }).map((group, index) => ({ ...group, name: `本バンド${index + 1}` }));
}

