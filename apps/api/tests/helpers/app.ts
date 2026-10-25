import request from 'supertest';
import { createApp } from '../../src/app.js';

/** A supertest agent bound to a freshly composed app — no server is started. */
export const api = () => request(createApp());
