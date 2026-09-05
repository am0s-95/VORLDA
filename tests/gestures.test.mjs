import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchCamera,movePieces} from '../lib/gestures.ts';
import {emptyGraph,makePiece,children} from '../lib/world.ts';

test('pinch zoom preserves the world point under the midpoint and pans with both fingers',()=>{
 const camera=new TouchCamera(),view={x:10,y:20,z:1};
 assert.equal(camera.down(7,{x:100,y:100},view),false);
 assert.equal(camera.down(12,{x:200,y:100},view),true);
 camera.move(7,{x:50,y:130});const next=camera.move(12,{x:250,y:130});
 assert.deepEqual(next,{x:-130,y:-30,z:2});
 camera.up(12);assert.equal(camera.blocked,true);assert.equal(camera.move(7,{x:10,y:10}),null);
 camera.up(7);assert.equal(camera.blocked,false);
});
test('a third finger cannot replace an active pinch or leave a stuck gesture',()=>{
 const c=new TouchCamera(),v={x:0,y:0,z:1};c.down(1,{x:0,y:0},v);c.down(2,{x:100,y:0},v);c.down(3,{x:900,y:0},v);
 assert.equal(c.move(3,{x:1000,y:0}).z,1);c.up(1);c.up(2);assert.equal(c.blocked,true);c.up(3);assert.equal(c.blocked,false);
 c.down(1,{x:0,y:0},v);c.reset();assert.equal(c.points.size,0);
});
test('free dragging preserves parent-relative geometry, mobile overrides and locked children',()=>{
 const g=emptyGraph(),p=makePiece('group',null,20,40),c=makePiece('text',p.id,10,20),locked=makePiece('text',null,8,8);locked.locked=true;g.pieces.push(p,c,locked);
 const d={graph:g,ids:[p.id,c.id,locked.id],pieceId:p.id,resize:false};const r=movePieces(d,12,16,false);
 assert.equal(r.pieces[0].x,32);assert.equal(r.pieces[1].x,10);assert.equal(r.pieces[2].x,8);assert.equal(g.pieces[0].x,20);
 const m=movePieces({...d,ids:[c.id],pieceId:c.id},12,16,true);assert.equal(m.pieces[1].mobile.x,24);assert.equal(m.pieces[1].x,10);
});
test('flow children reorder instead of silently changing unused coordinates',()=>{
 const g=emptyGraph(),p=makePiece('section');p.style.layout='column';p.style.gap=0;const a=makePiece('text',p.id),b=makePiece('text',p.id),c=makePiece('text',p.id);for(const x of[a,b,c])x.h=40;g.pieces.push(p,a,b,c);
 const r=movePieces({graph:g,ids:[a.id],pieceId:a.id,resize:false},0,65,false);assert.deepEqual(children(r,p.id).map(x=>x.id),[b.id,c.id,a.id]);assert.equal(r.pieces.find(x=>x.id===a.id).y,a.y);
 const resized=movePieces({graph:g,ids:[a.id],pieceId:a.id,resize:true},8,8,false);assert.equal(resized.pieces.find(x=>x.id===a.id).h,48);
});
test('mobile flow uses effective gap and skips mobile-hidden siblings',()=>{
 const g=emptyGraph(),p=makePiece('section');p.mobile={style:{layout:'column',gap:200}};const a=makePiece('text',p.id),b=makePiece('text',p.id),c=makePiece('text',p.id);a.h=b.h=c.h=40;g.pieces.push(p,a,b,c);const drag={graph:g,ids:[a.id],pieceId:a.id,resize:false};
 assert.deepEqual(children(movePieces(drag,0,30,true),p.id).map(x=>x.id),[a.id,b.id,c.id]);
 p.mobile.style.gap=0;b.mobile.hidden=true;b.h=1000;
 assert.deepEqual(children(movePieces(drag,0,30,true),p.id).map(x=>x.id),[b.id,c.id,a.id]);
});
test('selected grandparents do not double-move a descendant',()=>{
 const g=emptyGraph(),a=makePiece('group',null,20,20),b=makePiece('group',a.id,10,10),c=makePiece('text',b.id,4,4);g.pieces.push(a,b,c);
 const r=movePieces({graph:g,ids:[a.id,c.id],pieceId:a.id,resize:false},12,12,false);assert.equal(r.pieces[0].x,32);assert.equal(r.pieces[2].x,4);
});
