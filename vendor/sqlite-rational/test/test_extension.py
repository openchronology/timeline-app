import os, random, sqlite3, sys, tempfile, unittest
from fractions import Fraction as Q
EXTENSION = os.path.abspath(sys.argv.pop(1))
if hasattr(sys, 'set_int_max_str_digits'): sys.set_int_max_str_digits(0)
def text(q): return f'{q.numerator}/{q.denominator}'
def connection(path=':memory:'):
    c=sqlite3.connect(path); c.enable_load_extension(True); c.load_extension(EXTENSION); c.enable_load_extension(False)
    return c
def overview(c, low, high, threshold, mode, il=1, iu=0):
    return c.execute('SELECT time,last_time,weight,distinct_count,max_gap FROM coords WHERE lower=? AND upper=? AND threshold=? AND mode=? AND include_lower=? AND include_upper=?',
                     (text(low),text(high),text(threshold),mode,il,iu)).fetchall()
def reference(entries,lo,hi,threshold,mode,il=1,iu=0):
    result=[]
    for key,weight in entries:
        if key<lo or key==lo and not il or key>hi or key==hi and not iu: continue
        old=result[-1] if result else None
        anchor=old[1 if mode=='neighbors' else 0] if old else None
        if old and key-anchor<threshold:
            old[4]=max(old[4],key-old[1]);old[1]=key;old[2]+=weight;old[3]+=1
        else: result.append([key,key,weight,1,Q(0)])
    return [(text(a),text(b),n,k,text(g)) for a,b,n,k,g in result]
class ExtensionTests(unittest.TestCase):
    def setUp(self):
        self.c=connection();self.c.execute('CREATE VIRTUAL TABLE coords USING rational_index')
    def tearDown(self): self.c.close()
    def assert_tree(self, expected):
        rows = {row[0]: row[1:] for row in self.c.execute(
            'SELECT id,time,weight,l,r,height,first,last,count,size,gap,first_id FROM coords_nodes')}
        root = self.c.execute('SELECT root FROM coords_meta').fetchone()[0]
        seen = set()
        def walk(id):
            if not id: return [], 0
            self.assertNotIn(id, seen); seen.add(id)
            key,weight,l,r,height,first,last,count,size,gap,first_id = rows[id]
            left,lh = walk(l); right,rh = walk(r)
            key = Q(key)
            if left:self.assertLess(left[-1][0],key)
            if right:self.assertGreater(right[0][0],key)
            entries = left + [(key,weight,id)] + right
            self.assertLessEqual(abs(lh-rh),1)
            self.assertEqual(height,1+max(lh,rh))
            self.assertEqual((Q(first),Q(last),count,size,first_id),
                (entries[0][0],entries[-1][0],sum(w for _,w,_ in entries),len(entries),entries[0][2]))
            self.assertEqual(Q(gap),max((b[0]-a[0] for a,b in zip(entries,entries[1:])),default=Q(0)))
            return entries,height
        entries,_ = walk(root)
        self.assertEqual(len(seen),len(rows))
        self.assertEqual([(k,w) for k,w,_ in entries], sorted(expected.items()))
    def test_arithmetic_and_parser(self):
        for source,expected in [('2/4','1/2'),('-6/-8','3/4'),('0/-27','0/1'),('+0002/+0004','1/2')]:
            self.assertEqual(self.c.execute('SELECT q(?)',(source,)).fetchone()[0],expected)
        self.assertEqual(self.c.execute("SELECT q_decimal('-.125e2'),q_floor('-5/3'),q_ceil('-5/3'),q_make('-6','-8')").fetchone(),
                         ('-25/2','-2/1','-1/1','3/4'))
        for source in ['', '1/0','1/2/3','1/2\n',' 1/2','1/2\0','NaN']:
            with self.assertRaises(sqlite3.DatabaseError): self.c.execute('SELECT q(?)',(source,)).fetchall()
        for source in ['', '.', '1e','Infinity','1.0\n']:
            with self.assertRaises(sqlite3.DatabaseError): self.c.execute('SELECT q_decimal(?)',(source,)).fetchall()
        for bad in [0.5,1, b'1/2']:
            with self.assertRaises(sqlite3.DatabaseError): self.c.execute('SELECT q(?)',(bad,)).fetchall()
        self.assertEqual(self.c.execute("SELECT q_is_canonical('2/4'),q_is_canonical('1/2'),q_is_canonical(NULL),q_add(NULL,'1/2')").fetchone(),(0,1,0,None))
        rng=random.Random(21)
        for _ in range(100):
            a=Q(rng.randrange(-10**100,10**100),rng.randrange(1,10**60));b=Q(rng.randrange(1,10**90),rng.randrange(1,10**40))
            actual=self.c.execute('SELECT q_add(?,?),q_sub(?,?),q_mul(?,?),q_div(?,?)',(text(a),text(b))*4).fetchone()
            self.assertEqual(actual,tuple(map(text,(a+b,a-b,a*b,a/b))))
    def test_native_index_and_collation(self):
        self.c.execute('PRAGMA trusted_schema=OFF')
        self.c.execute('CREATE TABLE events(time TEXT COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1)) STRICT')
        self.c.execute('CREATE INDEX events_time ON events(time)')
        huge=Q(10**10000+123,7);tiny=Q(1,10**10000)
        for q in [Q(-10),Q(0),tiny,Q(1,10),Q(1,3),Q(1,2),Q(2,3),huge]: self.c.execute('INSERT INTO events VALUES(?)',(text(q),))
        query="SELECT time FROM events WHERE time>=q('2/6') AND time<q('2/3') ORDER BY time"
        self.assertEqual(self.c.execute(query).fetchall(),[('1/3',),('1/2',)])
        self.assertIn('INDEX',str(self.c.execute('EXPLAIN QUERY PLAN '+query).fetchall()))
        with self.assertRaises(sqlite3.IntegrityError): self.c.execute("INSERT INTO events VALUES('2/4')")
        samples=['-10/1','1/3','2/6','2/4','1/2','10/1','bogus','', '1/0','1/2\0']
        def cmp(a,b):
            return self.c.execute('SELECT CASE WHEN ? COLLATE RATIONAL_V1 < ? THEN -1 WHEN ? COLLATE RATIONAL_V1 = ? THEN 0 ELSE 1 END',(a,b,a,b)).fetchone()[0]
        for a in samples:
            for b in samples:
                self.assertEqual(cmp(a,b),-cmp(b,a))
                for d in samples:
                    if cmp(a,b)<=0 and cmp(b,d)<=0:self.assertLessEqual(cmp(a,d),0)
    def test_mutations_and_random_queries(self):
        rng=random.Random(1731);values={}
        for i in range(350):
            key=Q(rng.randrange(-100,101),rng.randrange(1,10))
            if key in values and rng.randrange(4)==0:
                self.c.execute('DELETE FROM coords WHERE time=?',(text(key),));del values[key]
            elif key in values:
                w=rng.randrange(1,5); self.c.execute('UPDATE coords SET weight=?,value=? WHERE time=?',(w,f'v{i}',text(key)));values[key]=w
            else:
                w=rng.randrange(1,5);self.c.execute('INSERT INTO coords(time,value,weight) VALUES(?,?,?)',(text(key),f'v{i}',w));values[key]=w
            entries=sorted(values.items())
            self.assert_tree(values)
            self.assertEqual(self.c.execute('SELECT time,weight FROM coords ORDER BY time').fetchall(),[(text(k),w) for k,w in entries])
            low,high,threshold=Q(-5,2),Q(7,3),Q(rng.randrange(6),3);il,iu=rng.randrange(2),rng.randrange(2)
            for mode in ['span','neighbors']:
                self.assertEqual(overview(self.c,low,high,threshold,mode,il,iu),reference(entries,low,high,threshold,mode,il,iu))
        self.c.execute("UPDATE coords SET time='200/1' WHERE rowid=(SELECT rowid FROM coords LIMIT 1)")
        rows=self.c.execute('SELECT time FROM coords').fetchall()
        self.assertEqual([Q(row[0]) for row in rows],sorted(Q(row[0]) for row in rows))
    def test_bounds_and_constraints(self):
        self.c.executemany('INSERT INTO coords(time,value) VALUES(?,?)',[('0/1','a'),('1/2','b'),('1/1','c')])
        self.assertEqual(self.c.execute("SELECT time FROM coords WHERE time BETWEEN q('0') AND q('1')").fetchall(),[('0/1',),('1/2',),('1/1',)])
        for mode in ['span','neighbors']:
            self.assertEqual(overview(self.c,Q(1,2),Q(1,2),Q(1),mode,1,1),[('1/2','1/2',1,1,'0/1')])
            self.assertEqual(overview(self.c,Q(2),Q(0),Q(1),mode),[])
        for statement in ["INSERT INTO coords(time) VALUES('2/4')","INSERT INTO coords(time) VALUES('1/0')",
                          "UPDATE coords SET weight=0", "UPDATE coords SET weight=NULL",
                          "UPDATE coords SET rowid=rowid+10","UPDATE coords SET max_gap=NULL"]:
            before=self.c.execute('SELECT rowid,time,value,weight FROM coords').fetchall()
            with self.assertRaises(sqlite3.DatabaseError):self.c.execute(statement)
            self.assertEqual(self.c.execute('SELECT rowid,time,value,weight FROM coords').fetchall(),before)
        with self.assertRaises(sqlite3.DatabaseError):
            self.c.execute("SELECT * FROM coords WHERE threshold='-1/1'").fetchall()
        self.assertEqual(self.c.execute('SELECT time FROM coords WHERE time>=NULL').fetchall(),[])
        self.assertEqual(self.c.execute('SELECT time FROM coords WHERE rowid=999').fetchall(),[])
        for rowid in [1,1.0,'1']:
            self.assertEqual(self.c.execute('SELECT time FROM coords WHERE rowid=?',(rowid,)).fetchall(),[('0/1',)])
        self.assertEqual(self.c.execute('SELECT time FROM coords WHERE rowid=1.5').fetchall(),[])
        self.assertEqual(self.c.execute('SELECT time FROM coords WHERE rowid=1 AND rowid=2').fetchall(),[])
        self.assertEqual(self.c.execute('SELECT time FROM coords ORDER BY time COLLATE BINARY').fetchall(),
            [('0/1',),('1/1',),('1/2',)])
    def test_persistence_rollback_and_savepoints(self):
        with tempfile.TemporaryDirectory() as temp:
            path=os.path.join(temp,'map.db');c=connection(path)
            c.execute('CREATE VIRTUAL TABLE coords USING rational_index')
            c.executemany('INSERT INTO coords(time,value) VALUES(?,?)',[(f'{i}/1',str(i)) for i in range(100)])
            c.commit();before=c.execute('SELECT rowid,time,value,weight FROM coords').fetchall()
            c.execute('SAVEPOINT edit');c.execute("UPDATE coords SET time='-100/1' WHERE time='50/1'")
            c.execute("DELETE FROM coords WHERE time<'20/1'")
            c.execute('ROLLBACK TO edit');c.execute('RELEASE edit')
            self.assertEqual(c.execute('SELECT rowid,time,value,weight FROM coords').fetchall(),before)
            c.execute("INSERT INTO coords(time) VALUES('1000/1')");c.rollback()
            self.assertEqual(c.execute('SELECT rowid,time,value,weight FROM coords').fetchall(),before)
            c.close();c=connection(path)
            self.assertEqual(c.execute('SELECT rowid,time,value,weight FROM coords').fetchall(),before)
            self.assertEqual(overview(c,Q(-1),Q(101),Q(2),'neighbors'),[('0/1','99/1',100,100,'1/1')])
            c.execute('DROP TABLE coords');c.close()
    def test_dense_index_skips_nodes(self):
        self.c.executemany('INSERT INTO coords(time,value) VALUES(?,?)',[(text(Q(i,1000000)),str(i)) for i in range(2000)])
        row=self.c.execute("SELECT weight,distinct_count,visited_nodes FROM coords WHERE lower='-1/1' AND upper='1/1' AND threshold='1/1000' AND mode='neighbors'").fetchone()
        self.assertEqual(row,(2000,2000,1))
        spans=overview(self.c,Q(-1),Q(1),Q(1,1000),'span')
        self.assertEqual(len(spans),2);self.assertEqual(sum(row[2] for row in spans),2000)
    def test_overflow_and_statement_atomicity(self):
        maximum = 2**63-1
        self.c.execute('INSERT INTO coords(time,weight) VALUES(?,?)',('0',maximum-1))
        with self.assertRaises(sqlite3.DatabaseError):
            self.c.execute("INSERT INTO coords(time) VALUES('1'),('2')")
        self.assert_tree({Q(0):maximum-1})
        self.c.execute("INSERT INTO coords(time) VALUES('1')")
        with self.assertRaises(sqlite3.DatabaseError):
            self.c.execute("UPDATE coords SET weight=2 WHERE time='1'")
        self.assert_tree({Q(0):maximum-1,Q(1):1})
        with self.assertRaises(sqlite3.DatabaseError):
            self.c.execute("INSERT INTO coords(time,weight) VALUES('2',0),('3',1)")
        self.assert_tree({Q(0):maximum-1,Q(1):1})
        self.c.execute("DELETE FROM coords WHERE time='0'")
        self.c.execute("INSERT INTO coords(time,weight) VALUES('2',7)")
        self.assert_tree({Q(1):1,Q(2):7})
    def test_utf16_and_attached_schema(self):
        c=connection();c.execute("PRAGMA encoding='UTF-16'")
        c.execute("CREATE TABLE t(time TEXT COLLATE RATIONAL_V1)")
        c.executemany('INSERT INTO t VALUES(?)',[('10/1',),('2/1',),('-1/1',)])
        self.assertEqual(c.execute('SELECT time FROM t ORDER BY time').fetchall(),[('-1/1',),('2/1',),('10/1',)])
        c.execute("ATTACH ':memory:' AS aux");c.execute('CREATE VIRTUAL TABLE aux.coords USING rational_index')
        c.execute("INSERT INTO aux.coords(time,value) VALUES('2/4',x'010203')")
        self.assertEqual(c.execute('SELECT time,value FROM aux.coords').fetchone(),('1/2',b'\x01\x02\x03'))
        c.close()
if __name__=='__main__':unittest.main()
