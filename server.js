require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const session = require('express-session');
const path = require('path');

const { attachUser } = require('./middleware/auth');
const Wallet = require('./models/Wallet');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');
const fundsRoutes = require('./routes/funds');
const communityRoutes = require('./routes/community');
const assistantRoutes = require('./routes/assistant');
const aboutRoutes = require('./routes/about');

const app = express();

// ----------------------------------------------------
// View engine
// ----------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.use(
  session({
    secret:
      process.env.JWT_SECRET ||
      'fallback_flash_secret',

    resave: false,
    saveUninitialized: false,

    rolling: true,

    cookie: {
      secure:
        process.env.NODE_ENV ===
        'production',

      maxAge:
        2 *
        60 *
        60 *
        1000
    }
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success =
    req.flash('success');

  res.locals.error =
    req.flash('error');

  res.locals.appName =
    process.env.APP_NAME ||
    'App';

  next();
});

app.use(attachUser);

// ----------------------------------------------------
// Wallet balance
// ----------------------------------------------------

app.use(async (req, res, next) => {

  if (!req.user)
    return next();

  try {

    const wallet =
      await Wallet.getOrCreate(
        req.user.id
      );

    res.locals.walletBalance =
      wallet.balanceCents ??
      wallet.balance_cents ??
      0;

  } catch (err) {

    console.error(
      'Wallet error:',
      err.message
    );

    res.locals.walletBalance = 0;
  }

  next();
});

// ----------------------------------------------------
// Pages
// ----------------------------------------------------

app.get('/', (req, res) => {

  if (req.user) {
    return res.redirect(
      '/dashboard'
    );
  }

  res.render(
    'landing',
    {
      title: 'Welcome'
    }
  );
});

app.get('/terms', (req, res) => {
  res.render(
    'terms',
    {
      title:
        'Terms & Conditions'
    }
  );
});

app.get('/privacy', (req, res) => {
  res.render(
    'privacy',
    {
      title:
        'Privacy Policy'
    }
  );
});

// ----------------------------------------------------
// Route debugger
// ----------------------------------------------------

function registerRoute(
  name,
  route
) {

  console.log(
    `[ROUTE] ${name}:`,
    typeof route,
    route &&
    route.constructor
      ? route.constructor.name
      : 'unknown'
  );

  app.use('/', route);
}

// ----------------------------------------------------
// Register routes
// ----------------------------------------------------

registerRoute(
  'authRoutes',
  authRoutes
);

registerRoute(
  'dashboardRoutes',
  dashboardRoutes
);

registerRoute(
  'settingsRoutes',
  settingsRoutes
);

registerRoute(
  'fundsRoutes',
  fundsRoutes
);

registerRoute(
  'communityRoutes',
  communityRoutes
);

registerRoute(
  'assistantRoutes',
  assistantRoutes
);

registerRoute(
  'aboutRoutes',
  aboutRoutes
);

// ----------------------------------------------------
// 404
// ----------------------------------------------------

app.use((req, res) => {

  res
    .status(404)
    .render(
      '404',
      {
        title:
          'Not found'
      }
    );
});

// ----------------------------------------------------
// Error handler
// ----------------------------------------------------

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      err
    );

    req.flash(
      'error',
      'Something went wrong.'
    );

    res.redirect(
      'back'
    );
  }
);

// ----------------------------------------------------
// Start
// ----------------------------------------------------

const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  () => {

    console.log(
      `${
        process.env.APP_NAME ||
        'App'
      } running on port ${PORT}`
    );
  }
);
