import { database } from '../src/lib/server/database';

database().$client.close();
console.log('Database migrations applied.');
