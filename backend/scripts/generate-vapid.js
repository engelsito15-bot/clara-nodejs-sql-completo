import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("\nCopia estas variables en Render > Environment:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:TU_CORREO@DOMINIO.COM");
console.log("PWA_CRON_SECRET=CAMBIA_ESTE_SECRETO_POR_UNO_LARGO\n");
