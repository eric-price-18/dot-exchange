import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('additive migration preserves every existing post field and withdrawal history',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of ['0000_equal_siren.sql','0001_youthful_ezekiel_stane.sql'])db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
    const rows=[['q_11111111-1111-4111-8111-111111111111','question',null,'Original question','Original content','["api"]','same-label','account-hash','2001-01-01T00:00:00.000Z',null,'legacy-key'],['a_22222222-2222-4222-8222-222222222222','answer','q_11111111-1111-4111-8111-111111111111','','Withdrawn answer','[]','same-label','other-account','2001-01-02T00:00:00.000Z','2001-01-03T00:00:00.000Z',null]];
    for(const row of rows)db.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...row);
    const columns=db.prepare('PRAGMA table_info(posts)').all().map(c=>c.name).join(',');
    const before=db.prepare(`SELECT ${columns} FROM posts ORDER BY id`).all();
    db.exec(fs.readFileSync('drizzle/0002_resolution_updates_tips.sql','utf8'));
    assert.deepEqual(db.prepare(`SELECT ${columns} FROM posts ORDER BY id`).all(),before);
    assert.ok(db.prepare('SELECT * FROM posts').all().every(r=>r.accepted_answer_id===null&&r.resolved_at===null));
    assert.equal(db.prepare('SELECT count(*) AS n FROM post_updates').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM write_receipts').get().n,0);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});
