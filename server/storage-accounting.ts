import { ApiError, db, now, type Env } from './db.ts';

export const PAYLOAD_PREFIX='vorlda-r2-json:v1:';
// Include retained and archived versions. An editor's quote belongs to project storage.
const sources=[
    "SELECT owner,'projects/'||id AS scope,graph AS stored FROM projects",
    "SELECT owner,'projects/'||id AS scope,draft AS stored FROM projects",
    ...[['snapshots','graph'],['publications','graph'],['quotes','payload'],['quotes','details']].map(([table,column])=>`SELECT p.owner,'projects/'||p.id AS scope,s.${column} AS stored FROM ${table} s JOIN projects p ON p.id=s.project_id`),
    "SELECT owner,'resources/'||id AS scope,data AS stored FROM studio_resources"
].join(' UNION ALL ');

export async function indexStoredObjects(env:Env,owner:string) {
    if(await db(env).prepare('SELECT owner FROM storage_indexes WHERE owner=?').bind(owner).first())return;
    // SQL-only index of legacy pointers, no object downloads or unbounded JS arrays.
    const ref=`substr(stored,${PAYLOAD_PREFIX.length+1})`;
    const invalid=await db(env).prepare(`SELECT scope FROM (${sources}) WHERE owner=? AND substr(stored,1,${PAYLOAD_PREFIX.length})='${PAYLOAD_PREFIX}' AND
        CASE WHEN json_valid(${ref}) THEN
            CASE WHEN json_type(${ref},'$.key')='text' AND json_type(${ref},'$.bytes')='integer'
                AND json_extract(${ref},'$.bytes') BETWEEN 0 AND 8000000
                AND json_type(${ref},'$.sha256')='text' AND length(json_extract(${ref},'$.sha256'))=64
                AND json_extract(${ref},'$.sha256') NOT GLOB '*[^a-f0-9]*'
                AND substr(json_extract(${ref},'$.key'),1,length(scope)+13)='payloads/v1/'||scope||'/'
                AND length(json_extract(${ref},'$.key'))=length(scope)+54
                AND substr(json_extract(${ref},'$.key'),-5)='.json'
                AND substr(json_extract(${ref},'$.key'),length(scope)+14,36) NOT GLOB '*[^a-f0-9-]*'
            THEN 0 ELSE 1 END
        ELSE 1 END=1 LIMIT 1`).bind(owner).first();
    if(invalid)throw new ApiError(503,'A retained storage reference needs repair before storage accounting can continue. No additional usage was admitted.');
    await db(env).batch([
        db(env).prepare(`INSERT INTO payload_objects(object_key,owner,scope,bytes,sha256,created_at)
            SELECT json_extract(${ref},'$.key'),owner,scope,json_extract(${ref},'$.bytes'),json_extract(${ref},'$.sha256'),?
            FROM (${sources}) WHERE owner=? AND substr(stored,1,${PAYLOAD_PREFIX.length})='${PAYLOAD_PREFIX}'
            ON CONFLICT(object_key) DO NOTHING`).bind(now(),owner),
        db(env).prepare('INSERT INTO storage_indexes(owner,indexed_at) VALUES(?,?) ON CONFLICT(owner) DO NOTHING').bind(owner,now())
    ]);
}
export const inlineBytesSQL=`COALESCE((SELECT SUM(length(CAST(stored AS BLOB))) FROM (${sources}) WHERE owner=? AND substr(stored,1,${PAYLOAD_PREFIX.length})!='${PAYLOAD_PREFIX}'),0)`;
export const storageTotalSQL=`COALESCE((SELECT SUM(a.size) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner=?),0)+COALESCE((SELECT SUM(bytes) FROM payload_objects WHERE owner=?),0)+COALESCE((SELECT SUM(bytes) FROM resource_reservations WHERE owner=?),0)+${inlineBytesSQL}`;
export async function storageBreakdown(env:Env,owner:string) {
    await indexStoredObjects(env,owner);
    const row=await db(env).prepare(`SELECT
        COALESCE((SELECT SUM(a.size) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner=?),0) AS assets,
        COALESCE((SELECT SUM(bytes) FROM payload_objects WHERE owner=?),0) AS payloads,
        COALESCE((SELECT SUM(bytes) FROM resource_reservations WHERE owner=?),0) AS pending,
        ${inlineBytesSQL} AS legacyInline`).bind(owner,owner,owner,owner).first<any>();
    return {...row,total:row.assets+row.payloads+row.pending+row.legacyInline};
}
