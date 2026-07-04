require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const session = require('express-session');
const path = require('path');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const fundsRoutes = require('./routes/funds');
const communityRoutes = require('./routes/community');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // needed on Render/Heroku for secure cookies

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// connect-flash needs a session; a lightweight in-memory session is fine here
// since auth itself is handled by the JWT cookie, not this session.
app.use(
  session({
    secret: process.env.JWT_SECRET || 'fallback_flash_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000 }
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.appName = process.env.APP_NAME || 'App';
  next();
});

app.use(attachUser);

app.get('/', (req, res) => {
  if (req.user) return res.redirect('/settings');
  res.render('landing', { title: 'Welcome' });
});

app.get('/terms', (req, res) => {
  res.render('terms', { title: 'Terms & Conditions' });
});

app.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy Policy' });
});

app.use('/', authRoutes);
app.use('/', settingsRoutes);
app.use('/', fundsRoutes);
app.use('/', communityRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  req.flash('error', 'Something went wrong. Please try again.');
  res.redirect('back');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${process.env.APP_NAME || 'App'} running on port ${PORT}`);
});
