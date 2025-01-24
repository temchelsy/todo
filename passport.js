import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from './models/user.js';
import dotenv from 'dotenv';

dotenv.config();

const initializePassport = (app) => {
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/users/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('Google Strategy Callback - Profile:', {
            id: profile.id,
            displayName: profile.displayName,
            email: profile.emails?.[0]?.value,
          });

          let user = await User.findOne({ googleId: profile.id });
          console.log('Existing user found:', !!user);

          if (!user) {
            user = new User({
              googleId: profile.id,
              username: profile.displayName,
              email: profile.emails[0].value,
              profileImage: profile.photos?.[0]?.value || '',
            });
            await user.save();
            console.log('New user created');
          }

          return done(null, user);
        } catch (error) {
          console.error('Error in Google Strategy:', error);
          return done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      console.log('Deserializing user:', id);
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error, null);
    }
  });
};

export default initializePassport;