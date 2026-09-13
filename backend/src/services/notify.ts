import { Notification } from '../models/ops.js';
import { Types } from 'mongoose';

export async function notify(userId: Types.ObjectId | string, type: string, title: string, body: string) {
  try {
    await Notification.create({ userId, type, title, body });
  } catch {
    // notifications must never break core flows
  }
}
