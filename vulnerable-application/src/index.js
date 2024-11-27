import express from 'express';
import { engine } from 'express-handlebars';
import session from 'express-session';
import { addComment, getCandidates, getComments, getHasUserVoted, getUserIdByCredentials, getUsers, vote } from './data/repository.js';
import bodyParser from 'body-parser';
import logger from 'morgan';

const asyncErrorHandler = (func) => (req, res, next) => 
  Promise.resolve(func(req, res, next)).catch(next);

const app = express();

app.use(logger('dev'));

app.use(session({
  secret: "SuperSecret",
  name: "session-cookie",
  cookie: {
    httpOnly: false,
  },
  saveUninitialized: true,
  resave: true
}));

app.use(express.static('src/public'));

app.use(bodyParser.urlencoded({ extended: true }));
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './src/views');

app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn;
  res.locals.loggedInUser = req.session.loggedInUser;
  res.locals.loggedInUsername = req.session.loggedInUsername;
  next()
})

app.post('/login', asyncErrorHandler(async (req, res) => {
  const loggedInUserId = await getUserIdByCredentials(req.body);
  if (!loggedInUserId) {
    res.redirect(`/error?message=unable to log in user ${req.body.username}`);
    return
  }

  req.session.loggedInUser = loggedInUserId;
  req.session.loggedInUsername = req.body.username;
  req.session.isLoggedIn = true;
  res.redirect("/voting");
}));

app.get('/logout', asyncErrorHandler(async (req, res) => {
  req.session = null;
  res.clearCookie("session-cookie");
  res.redirect("/");
}));

app.get('/error', (req, res) => {
  res.render('error', { message: req.query.message });
});

app.get('/internal', asyncErrorHandler(async (req, res) => {
  if (!req.session.isLoggedIn) {
    res.redirect('/');
    return;
  }

  const users = await getUsers();

  res.render('internal', { users });
}));

app.get('/voting', asyncErrorHandler(async (req, res) => {
  if (!req.session.isLoggedIn) {
    res.redirect('/');
    return;
  }

  const hasUserVotedPromise = getHasUserVoted(req.session.loggedInUser);
  const commentsPromise = getComments();
  const candidatesPromise = getCandidates();

  const [hasVoted, comments, candidates] = await Promise.all([hasUserVotedPromise, commentsPromise, candidatesPromise]);

  res.render('voting', { candidates, comments, hasVoted });
}));

app.post('/add-comment', asyncErrorHandler(async (req, res) => {
  if (!req.session.isLoggedIn) {
    res.redirect('/');
    return;
  }
  await addComment(req.body);
  res.redirect('/voting');

}));

app.post('/vote', asyncErrorHandler(async (req, res) => {
  if (!req.session.isLoggedIn) {
    res.redirect("/error");
    return;
  }

  const userId = req.session.loggedInUser;
  const candidateId = req.body.candidateId;

  await vote({ userId, candidateId });
  res.redirect("/voting");
}));

app.get('/', (req, res) => {
  if (req.session.isLoggedIn) {
    res.redirect("/voting");
  }

  res.render('home');
});

// error handler
app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = err;

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const port = process.env.PORT || 3000;
app.listen(port);
console.log(`App started on http://localhost:${port}`);
