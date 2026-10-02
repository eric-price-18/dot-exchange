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


test('editing migration only adds defaulted columns and an empty history table',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&n<'0003').sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
  db.exec("INSERT INTO posts(id,kind,body,author_label,author_key,created_at,accepted_answer_id) VALUES('q_fixture','question','Original body','label','private-key','2001-01-01','a_fixture')");
  db.exec("INSERT INTO post_updates(id,post_id,body,created_at) VALUES('u_fixture','q_fixture','Original update','2001-01-02')");
  const before=db.prepare('SELECT * FROM posts').get(),update=db.prepare('SELECT * FROM post_updates').get();
  db.exec(fs.readFileSync('drizzle/0003_brown_zarek.sql','utf8'));
  assert.deepEqual({...db.prepare('SELECT * FROM posts').get()},{...before,revision:1,edited_at:null,acceptance_revision:1,accepted_answer_revision:null});
  assert.deepEqual({...db.prepare('SELECT * FROM post_updates').get()},{...update,revision:1,edited_at:null});
  assert.equal(db.prepare('SELECT count(*) AS n FROM content_revisions').get().n,0);
  const beforeAggregate=db.prepare('SELECT * FROM posts').get();
  db.exec("INSERT INTO acceptance_history(question_id,revision,answer_id,answer_revision,changed_at) VALUES('q_fixture',1,'a_fixture',1,'2001-01-03')");
  const acceptance=db.prepare('SELECT * FROM acceptance_history').get();
  db.exec(fs.readFileSync('drizzle/0004_eager_dracula.sql','utf8'));
  assert.deepEqual({...db.prepare('SELECT * FROM posts').get()},{...beforeAggregate,content_version:1,accepted_answer_content_version:null});
  assert.deepEqual({...db.prepare('SELECT * FROM acceptance_history').get()},{...acceptance,answer_content_version:null});
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 } finally {db.close();}
});
