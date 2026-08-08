export const tableManifest = {
  group: 'fixture-beta',
  tables: [
    {
      name: 'fixture_beta',
      scope: 'TENANT',
      mutability: 'MUTABLE_METADATA',
      requiredColumns: ['id', 'organization_id', 'created_at', 'updated_at', 'row_version'],
    },
  ],
};
