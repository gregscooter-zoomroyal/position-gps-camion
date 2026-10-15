import { creerApplication } from './app.js';

const port = Number(process.env.PORT || 4730);
const app = creerApplication();

app.server.listen(port, '127.0.0.1', () => {
  const adresse = app.server.address();
  console.log(`Talk est allumé : http://localhost:${adresse.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}
