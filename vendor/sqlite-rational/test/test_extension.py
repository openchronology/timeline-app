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
    def test_size_limits_and_schema_use(self):
        self.assertEqual(self.c.execute("SELECT q_decimal('1e10000'),q_decimal('-1e-10000')").fetchone(),
                         ('1'+'0'*10000+'/1','-1/1'+'0'*10000))
        for source in ['1e10001','1e-10001','1e99999999999','0e99999999999','1e'+'9'*40]:
            with self.assertRaises(sqlite3.DataError): self.c.execute('SELECT q_decimal(?)',(source,)).fetchall()
        big='1'*1048576
        self.assertEqual(self.c.execute('SELECT q_cmp(?,?)',(big,big)).fetchone(),(0,))
        for sql in ['SELECT q(?)','SELECT q_decimal(?)','SELECT q_add(?,?)']:
            args=(big+'1',)*sql.count('?')
            with self.assertRaises(sqlite3.DataError): self.c.execute(sql,args).fetchall()
        self.assertEqual(self.c.execute("SELECT q_is_canonical(?)",(big+'/1',)).fetchone(),(0,))
        # Only q_is_canonical may run from a schema; the rest are refused in generated columns,
        # views and defaults, including in a file whose schema was written by hand.
        self.c.execute('CREATE TABLE ok(time TEXT CHECK(q_is_canonical(time)=1))')
        self.c.execute("CREATE TABLE d(a TEXT DEFAULT (q('1')))")
        for statement in ["CREATE TABLE g(a TEXT, b TEXT GENERATED ALWAYS AS (q_decimal('1e5')) VIRTUAL)",
                          "CREATE INDEX i ON ok(q(time))", "INSERT INTO d DEFAULT VALUES"]:
            with self.assertRaises(sqlite3.OperationalError): self.c.execute(statement)
        with tempfile.TemporaryDirectory() as temp:
            path=os.path.join(temp,'crafted.db');c=sqlite3.connect(path)
            c.execute("CREATE TABLE g(a TEXT, b TEXT GENERATED ALWAYS AS (upper(a)) VIRTUAL)")
            c.execute("INSERT INTO g(a) VALUES('x')");c.commit()
            c.execute('PRAGMA writable_schema=ON')
            c.execute("UPDATE sqlite_schema SET sql=replace(sql,'upper(a)',\"q_decimal('1e99999999999')\") WHERE name='g'")
            c.commit();c.close();c=connection(path)
            with self.assertRaises(sqlite3.DatabaseError): c.execute('SELECT b FROM g').fetchall()
            c.close()
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
    def test_bulk_append_and_build(self):
        rng=random.Random(4211);values={}
        while len(values)<500: values[Q(rng.randrange(-10**6,10**6),rng.randrange(1,50))]=rng.randrange(1,6)
        shuffled=list(values.items());rng.shuffle(shuffled)
        self.c.executemany("INSERT INTO coords(time,value,weight,mode) VALUES(?,?,?,'append')",
            [(text(k),f'v{i}',w) for i,(k,w) in enumerate(shuffled)])
        # Until built, queries and ordinary changes are refused.
        for statement in ['SELECT time FROM coords',"INSERT INTO coords(time) VALUES('7/3')",
                          "DELETE FROM coords WHERE time='0/1'"]:
            with self.assertRaisesRegex(sqlite3.DatabaseError,'build'): self.c.execute(statement).fetchall()
        self.c.execute("INSERT INTO coords(mode) VALUES('build')")
        self.assert_tree(values)
        entries=sorted(values.items())
        self.assertEqual(self.c.execute('SELECT time,weight FROM coords ORDER BY time').fetchall(),[(text(k),w) for k,w in entries])
        for threshold in [Q(0),Q(1,7),Q(1000)]:
            for mode in ['span','neighbors']:
                self.assertEqual(overview(self.c,Q(-10**6),Q(10**6),threshold,mode),reference(entries,Q(-10**6),Q(10**6),threshold,mode))
        # The built index takes ordinary changes, and appends only once empty again.
        self.c.execute("INSERT INTO coords(time,weight) VALUES('1/3',2)");values[Q(1,3)]=2
        self.c.execute('DELETE FROM coords WHERE time=?',(text(entries[0][0]),));del values[entries[0][0]]
        self.assert_tree(values)
        with self.assertRaises(sqlite3.DatabaseError): self.c.execute("INSERT INTO coords(time,mode) VALUES('9/1','append')")
        # Building again rebuilds the same rows; rowids are kept and new ones follow them.
        rowids=self.c.execute('SELECT rowid,time FROM coords ORDER BY rowid').fetchall()
        self.c.execute("INSERT INTO coords(mode) VALUES('build')")
        self.assert_tree(values)
        self.assertEqual(self.c.execute('SELECT rowid,time FROM coords ORDER BY rowid').fetchall(),rowids)
        self.c.execute("INSERT INTO coords(time) VALUES('99/7')");values[Q(99,7)]=1
        self.assertGreater(self.c.execute("SELECT rowid FROM coords WHERE time='99/7'").fetchone()[0],max(r for r,_ in rowids))
        self.assert_tree(values)
        self.c.execute('DELETE FROM coords');self.c.execute("INSERT INTO coords(mode) VALUES('build')")
        self.assert_tree({})
    def test_bulk_load_refusals(self):
        for statement in ["INSERT INTO coords(mode) VALUES('other')","INSERT INTO coords(mode) VALUES(1)",
                          "INSERT INTO coords(time,mode) VALUES('1/1','build')",
                          "INSERT INTO coords(time,threshold,mode) VALUES('1/1','1/1','append')",
                          "INSERT INTO coords(time,weight,mode) VALUES('1/1',0,'append')",
                          "INSERT INTO coords(time,mode) VALUES('1/0','append')"]:
            with self.assertRaises(sqlite3.DatabaseError,msg=statement): self.c.execute(statement)
        self.assert_tree({})
        # Two rows at one rational value: the build fails, and its statement changes nothing.
        self.c.executemany("INSERT INTO coords(time,mode) VALUES(?,'append')",[('1/2',),('2/4',),('3/1',)])
        with self.assertRaises(sqlite3.DatabaseError): self.c.execute("INSERT INTO coords(mode) VALUES('build')")
        with self.assertRaisesRegex(sqlite3.DatabaseError,'build'): self.c.execute('SELECT * FROM coords').fetchall()
        self.c.execute("DELETE FROM coords_nodes WHERE time='1/2' AND rowid=1")
        self.c.execute("INSERT INTO coords(mode) VALUES('build')")
        self.assert_tree({Q(1,2):1,Q(3):1})
        # Weights that overflow together fail the build.
        c=connection();c.execute('CREATE VIRTUAL TABLE coords USING rational_index')
        c.executemany("INSERT INTO coords(time,weight,mode) VALUES(?,?,'append')",[('0',2**63-1),('1',1)])
        with self.assertRaises(sqlite3.DatabaseError): c.execute("INSERT INTO coords(mode) VALUES('build')")
        c.close()
    def test_bulk_load_persists(self):
        with tempfile.TemporaryDirectory() as temp:
            path=os.path.join(temp,'map.db');c=connection(path)
            c.execute('CREATE VIRTUAL TABLE coords USING rational_index')
            c.executemany("INSERT INTO coords(time,value,mode) VALUES(?,?,'append')",[(f'{i}/3',str(i)) for i in range(2000,0,-1)])
            c.execute("INSERT INTO coords(mode) VALUES('build')");c.commit();c.close()
            c=connection(path)
            self.assertEqual(overview(c,Q(0),Q(1000),Q(1,2),'neighbors'),[('1/3','2000/3',2000,2000,'1/3')])
            self.assertEqual(c.execute("SELECT value FROM coords WHERE time='1/1'").fetchone(),('3',))
            c.close()
    def test_sum_aggregate(self):
        c=self.c
        self.assertEqual(c.execute("SELECT q_sum(x) FROM (SELECT '1/2' x UNION ALL SELECT '1/3' UNION ALL SELECT NULL UNION ALL SELECT '7')").fetchone()[0],'47/6')
        self.assertEqual(c.execute("SELECT q_sum(x) FROM (SELECT NULL x WHERE 0)").fetchone()[0],'0/1')
        self.assertEqual(c.execute("SELECT q_sum(x) FROM (SELECT NULL x)").fetchone()[0],'0/1')
        self.assertEqual(c.execute("SELECT g,q_sum(x) FROM (SELECT 1 g,'-3' x UNION ALL SELECT 1,'3' UNION ALL SELECT 2,'5/10') GROUP BY g").fetchall(),[(1,'0/1'),(2,'1/2')])
        for bad in ['x','1/0',1.5]:
            with self.assertRaises(sqlite3.DatabaseError): c.execute("SELECT q_sum(?)",(bad,)).fetchall()
    def test_sums_total_like_weights(self):
        """Rows' sums vectors are totalled per subtree and per overview group, exactly, through
        inserts, updates (of the sums alone, or the key), deletes, bulk builds and a reopen."""
        c=self.c; rng=random.Random(574)
        def vec(): return [Q(rng.randint(-9,9),rng.randint(1,4)) for _ in range(rng.randint(0,3))]
        def vtext(v): return ';'.join(text(x) for x in v)
        def add(a,b):
            n=max(len(a),len(b)); return [(a[i] if i<len(a) else 0)+(b[i] if i<len(b) else 0) for i in range(n)]
        def norm(v):
            v=list(v)
            while v and v[-1]==0: v.pop()
            return vtext(v) or None
        rows={}
        def check():
            for _ in range(15):
                lo=Q(rng.randint(-60,60),rng.randint(1,3)); hi=lo+Q(rng.randint(0,80),rng.randint(1,2))
                th=Q(rng.randint(0,12),rng.randint(1,2))
                for mode in ['span','neighbors']:
                    got=c.execute('SELECT time,last_time,sums FROM coords WHERE lower=? AND upper=? AND threshold=? AND mode=? AND include_upper=1',(text(lo),text(hi),text(th),mode)).fetchall()
                    for first,last,sums in got:
                        want=[0]
                        for k,(w,v) in rows.items():
                            if Q(first)<=k<=Q(last): want=add(want,v)
                        self.assertEqual(sums,norm(want),(first,last,mode))
        ids={}
        for step in range(400):
            r=rng.random()
            if ids and r<0.25:
                k=rng.choice(list(ids)); c.execute('DELETE FROM coords WHERE rowid=?',(ids.pop(k),)); rows.pop(k)
            elif ids and r<0.5:
                k=rng.choice(list(ids)); v=vec(); c.execute('UPDATE coords SET sums=? WHERE rowid=?',(vtext(v) or None,ids[k])); rows[k]=(rows[k][0],v)
            elif ids and r<0.6:
                k=rng.choice(list(ids)); new=Q(rng.randint(-80,80),rng.randint(1,3))
                if new in rows: continue
                c.execute('UPDATE coords SET time=? WHERE rowid=?',(text(new),ids[k])); rows[new]=rows.pop(k); ids[new]=ids.pop(k)
            else:
                k=Q(rng.randint(-80,80),rng.randint(1,3))
                if k in rows: continue
                v=vec(); w=rng.randint(1,4)
                ids[k]=c.execute('INSERT INTO coords(time,value,weight,sums) VALUES(?,?,?,?)',(text(k),text(k),w,vtext(v) or None)).lastrowid; rows[k]=(w,v)
            if step%40==0: check()
        check()
        # The whole tree's root total is every row's sums added.
        root=c.execute('SELECT total FROM coords_nodes WHERE id=(SELECT root FROM coords_meta)').fetchone()[0]
        want=[0]
        for w,v in rows.values(): want=add(want,v)
        self.assertEqual(root,norm(want))
        # Built in bulk from appended rows, the same.
        c.execute('DELETE FROM coords')
        for k,(w,v) in rows.items(): c.execute("INSERT INTO coords(time,value,weight,sums,mode) VALUES(?,?,?,?,'append')",(text(k),text(k),w,vtext(v) or None))
        c.execute("INSERT INTO coords(mode) VALUES('build')"); check()
        for bad in ['1/2;x','1/0',b'1',5]:
            with self.assertRaises(sqlite3.DatabaseError): c.execute("INSERT INTO coords(time,sums) VALUES('999/1',?)",(bad,))
    def test_index_without_sums_columns(self):
        """An index whose shadow table predates sums keeps working without them."""
        path=os.path.join(tempfile.mkdtemp(),'old.db'); c=connection(path)
        c.execute('CREATE VIRTUAL TABLE coords USING rational_index')
        c.execute("INSERT INTO coords(time,weight) VALUES('1/1',2),('2/1',3)"); c.commit(); c.close()
        c=sqlite3.connect(path); c.execute('ALTER TABLE coords_nodes DROP COLUMN sums'); c.execute('ALTER TABLE coords_nodes DROP COLUMN total'); c.commit(); c.close()
        c=connection(path)
        c.execute("INSERT INTO coords(time,weight) VALUES('3/1',1)")
        self.assertEqual(c.execute("SELECT time,weight,sums FROM coords WHERE lower='0/1' AND upper='9/1' AND threshold='100/1' AND mode='span'").fetchall(),[('1/1',6,None)])
        with self.assertRaises(sqlite3.DatabaseError): c.execute("INSERT INTO coords(time,sums) VALUES('4/1','1/1')")
        c.close()
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
