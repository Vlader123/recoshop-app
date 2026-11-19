import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db';
import { Errors, wrap } from '../middleware/errors';

export const subscriptionsRouter = Router();

subscriptionsRouter.post(
  '/subscriptions',
  wrap(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(req.body);
    if (await queryOne('SELECT 1 FROM subscriptions WHERE email = $1', [email])) throw Errors.alreadySubscribed();
    await queryOne('INSERT INTO subscriptions (email) VALUES ($1)', [email]);
    res.status(201).json({ subscribed: true });
  })
);
