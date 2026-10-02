const express=require('express');
const cors=require('cors');
const path=require('path');
const fs=require('fs');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const Database=require('better-sqlite3');
const multer=require('multer');

const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||'DEV_ONLY_CHANGE_ME';
const MODERATOR_INVITE_CODE=process.env.MODERATOR_INVITE_CODE||'DEV_MODERATOR_CODE';
const root=__dirname;
fs.mkdirSync(path.join(root,'uploads'),{recursive:true});
const db=new Database(path.join(root,'battalion.db'));

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,username TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS resources(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,subject TEXT NOT NULL,chapter TEXT,title TEXT NOT NULL,url TEXT,file_path TEXT,uploaded_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(uploaded_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS bookmarks(user_id INTEGER NOT NULL,resource_id INTEGER NOT NULL,PRIMARY KEY(user_id,resource_id));
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,body TEXT NOT NULL,created_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(created_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS missions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
`);

const app=express();
app.use(cors());app.use(express.json({limit:'2mb'}));app.use('/uploads',express.static(path.join(root,'uploads')));
app.use(express.static(path.join(root,'public')));
const upload=multer({dest:path.join(root,'uploads'),limits:{fileSize:100*1024*1024}});

function tokenFor(user){return jwt.sign({id:user.id,email:user.email,username:user.username,role:user.role},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(h.slice(7),JWT_SECRET);next();}catch{return res.status(401).json({error:'Invalid or expired session'});}}
function moderator(req,res,next){if(req.user.role!=='moderator')return res.status(403).json({error:'Moderator access required'});next();}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'BATTALION DH'}));
app.post('/api/auth/register',async(req,res)=>{const {email,password,username,moderatorCode}=req.body||{};if(!email||!password||!username)return res.status(400).json({error:'Email, password and username are required'});if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters'});const role=moderatorCode&&moderatorCode===MODERATOR_INVITE_CODE?'moderator':'student';try{const hash=await bcrypt.hash(password,12);const info=db.prepare('INSERT INTO users(email,password_hash,username,role) VALUES(?,?,?,?)').run(email.toLowerCase().trim(),hash,username.trim(),role);const user=db.prepare('SELECT id,email,username,role,created_at FROM users WHERE id=?').get(info.lastInsertRowid);res.status(201).json({user,token:tokenFor(user)});}catch(e){if(String(e).includes('UNIQUE'))return res.status(409).json({error:'Email already registered'});res.status(500).json({error:'Could not create account'});}});
app.post('/api/auth/login',async(req,res)=>{const {email,password}=req.body||{};const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase().trim());if(!user||!(await bcrypt.compare(password||'',user.password_hash)))return res.status(401).json({error:'Invalid email or password'});res.json({user:{id:user.id,email:user.email,username:user.username,role:user.role,created_at:user.created_at},token:tokenFor(user)});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/resources',auth,(req,res)=>{const {type,subject,chapter,q}=req.query;let sql='SELECT id,type,subject,chapter,title,url,file_path,created_at FROM resources WHERE 1=1';const p=[];if(type){sql+=' AND type=?';p.push(type)}if(subject){sql+=' AND subject=?';p.push(subject)}if(chapter){sql+=' AND chapter=?';p.push(chapter)}if(q){sql+=' AND (title LIKE ? OR chapter LIKE ? OR subject LIKE ?)';const s='%'+q+'%';p.push(s,s,s)}sql+=' ORDER BY created_at DESC';res.json({resources:db.prepare(sql).all(...p)});});
app.post('/api/resources/link',auth,moderator,(req,res)=>{const {type,subject,chapter,title,url}=req.body||{};if(!type||!subject||!title||!url)return res.status(400).json({error:'type, subject, title and url are required'});const info=db.prepare('INSERT INTO resources(type,subject,chapter,title,url,uploaded_by) VALUES(?,?,?,?,?,?)').run(type,subject,chapter||null,title,url,req.user.id);res.status(201).json({id:info.lastInsertRowid});});
app.post('/api/resources/pdf',auth,moderator,upload.single('file'),(req,res)=>{const {type,subject,chapter,title}=req.body||{};if(!req.file||!type||!subject||!title){if(req.file)fs.unlinkSync(req.file.path);return res.status(400).json({error:'PDF, type, subject and title are required'});}if(req.file.mimetype!=='application/pdf'){fs.unlinkSync(req.file.path);return res.status(400).json({error:'Only PDF files are allowed'});}const info=db.prepare('INSERT INTO resources(type,subject,chapter,title,file_path,uploaded_by) VALUES(?,?,?,?,?,?)').run(type,subject,chapter||null,title,'/uploads/'+path.basename(req.file.path),req.user.id);res.status(201).json({id:info.lastInsertRowid,file_path:'/uploads/'+path.basename(req.file.path)});});
app.delete('/api/resources/:id',auth,moderator,(req,res)=>{const r=db.prepare('SELECT * FROM resources WHERE id=?').get(req.params.id);if(!r)return res.status(404).json({error:'Resource not found'});if(r.file_path){const f=path.join(root,r.file_path.replace(/^\//,''));if(fs.existsSync(f))fs.unlinkSync(f)}db.prepare('DELETE FROM bookmarks WHERE resource_id=?').run(r.id);db.prepare('DELETE FROM resources WHERE id=?').run(r.id);res.json({ok:true});});

app.get('/api/bookmarks',auth,(req,res)=>res.json({resources:db.prepare('SELECT r.* FROM resources r JOIN bookmarks b ON b.resource_id=r.id WHERE b.user_id=? ORDER BY r.created_at DESC').all(req.user.id)}));
app.post('/api/bookmarks/:id',auth,(req,res)=>{const id=Number(req.params.id);const exists=db.prepare('SELECT 1 FROM bookmarks WHERE user_id=? AND resource_id=?').get(req.user.id,id);if(exists){db.prepare('DELETE FROM bookmarks WHERE user_id=? AND resource_id=?').run(req.user.id,id);return res.json({saved:false});}db.prepare('INSERT INTO bookmarks(user_id,resource_id) VALUES(?,?)').run(req.user.id,id);res.json({saved:true});});

app.get('/api/announcements',(req,res)=>res.json({announcements:db.prepare('SELECT id,title,body,created_at FROM announcements ORDER BY created_at DESC').all()}));
app.post('/api/announcements',auth,moderator,(req,res)=>{const {title,body}=req.body||{};if(!title||!body)return res.status(400).json({error:'Title and body are required'});const info=db.prepare('INSERT INTO announcements(title,body,created_by) VALUES(?,?,?)').run(title,body,req.user.id);res.status(201).json({id:info.lastInsertRowid});});
app.delete('/api/announcements/:id',auth,moderator,(req,res)=>{db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);res.json({ok:true});});

app.get('*',(req,res)=>res.sendFile(path.join(root,'public','index.html')));
app.listen(PORT,()=>console.log(`BATTALION DH running at http://localhost:${PORT}`));
