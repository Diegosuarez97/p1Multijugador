# Servidor

Per generar un secret per posar-lo al `.env` a la variable `JWT_SECRET` podem fer servir aquesta comanda:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```