var extension_default = {
  name: "atelier",
  features: ["atelier"],
  api: atelierApi,
  publicKinds: { record: renderRecordPage },
  mcp: {
    tools: ATELIER_TOOLS,
    instructions: ATELIER_INSTRUCTIONS,
    call: callAtelierTool,
    onRequest({ origin }) {
      setOrigin(origin);
      setToday(null);
    },
    async itemInfo(env, id, origin) {
      const used = await usageOf(env, "item", id);
      return { used_in_workspace: used.map((u2) => ({ ...u2, url: `${origin}/#fiche/${u2.id}` })) };
    }
  },
  // tâches planifiées : index sémantique des fiches, miroir Notion (si un jeton est configuré), corbeille
  async scheduled(env, { hour, origin }) {
    await embedMissingRecords(env, 100);
    if (env.NOTION_TOKEN) await mirrorRun(env, origin || "");
    if (hour === 2) await purgeRecords(env, 30);
  },
  trash: { list: trashRecords, purge: purgeRecords },
  backupData: atelierBackupData,
  exportRaw: ATELIER_RAW,
  exportAll: exportAtelier
};
