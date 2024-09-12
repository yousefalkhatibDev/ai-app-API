const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const pool = require('./database').pool;

function initialize(passport) {
    const authenticateUser = (email, password, done) => {
        const sqlQuery = "SELECT * FROM users WHERE email = ?";
        pool.query(sqlQuery, [email], async (err, results) => {
            if (err) {
                return done(err);
            }
            if (results.length === 0) {
                return done(null, false, { message: 'No user with that username' });
            }

            const user = results[0];
            try {
                if (await bcrypt.compare(password, user.password)) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Password incorrect' });
                }
            } catch (error) {
                return done(error);
            }
        });
    };

    passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
    passport.serializeUser((user, done) => {
        done(null, user.id)
    });
    passport.deserializeUser((id, done) => {
        const sqlQuery = "SELECT * FROM users WHERE id = ?";
        pool.query(sqlQuery, [id], (err, results) => {
            if (err) {
                return done(err);
            }
            return done(null, results[0]);
        });
    });
}

module.exports = initialize;