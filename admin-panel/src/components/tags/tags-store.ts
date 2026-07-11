export function useTagsStore() {
  return { tags: [], refresh: () => {} };
}

export function assignTagsToAddresses(_tagIds: number[], _addresses: string[]) {
  return Promise.resolve();
}
