import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCircleBiometricVault} from '../src/lib/circleBiometricVault.ts';
import {AccessControl} from '@capgo/capacitor-native-biometric';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const values=new Map();let prompts=0,cancel=false,failEnvelope=false,available=true;
const native={isAvailable:async()=>({isAvailable:available,strongBiometryIsAvailable:available}),isCredentialsSaved:async({server})=>({isSaved:values.has(server)}),
 setCredentials:async value=>{if(value.accessControl===AccessControl.BIOMETRY_CURRENT_SET){prompts++;if(cancel)throw Error('Cancelled');}if(failEnvelope&&value.password.startsWith('hashpaystream-circle-biometric-v1:'))throw Error('Write failed');values.set(value.server,{...value});},
 getCredentials:async({server})=>{const result=values.get(server);assert.equal(result.accessControl,AccessControl.NONE);return result;},
 getSecureCredentials:async({server})=>{prompts++;if(cancel)throw Error('Cancelled');const result=values.get(server);if(!result)throw Error('Invalidated');assert.equal(result.accessControl,AccessControl.BIOMETRY_CURRENT_SET);return result;},
 deleteCredentials:async({server})=>{values.delete(server);}};
const server='fixture.app.email',email='user@example.com',raw='fixture-session-token';
let vault=createCircleBiometricVault(native);
await vault.write(server,email,raw);assert.equal((await vault.read(server,email)).password,raw);assert.equal(prompts,0);
cancel=true;await assert.rejects(vault.enable(server,email,raw));assert.equal((await vault.read(server,email)).password,raw);cancel=false;
await vault.enable(server,email,raw);assert.equal(await vault.enabled(server),true);assert.ok(!values.get(server).password.includes(raw));assert.equal(prompts,2);
await vault.write(server,email,'refreshed-session');assert.equal(prompts,2,'No second biometric prompt for refresh');
vault=createCircleBiometricVault(native);await assert.rejects(vault.write(server,email,'downgrade'),/Unlock/);
cancel=true;await assert.rejects(vault.read(server,email),/Cancelled/);assert.ok(!values.get(server).password.includes(raw));cancel=false;
assert.equal((await vault.read(server,email)).password,'refreshed-session');
await assert.rejects(vault.read(server,'different@example.com'),/another account/);
const saved={...values.get(server)};values.set('other-server',saved);values.set('other-server.biometric-key-v1',{...values.get(server+'.biometric-key-v1')});await assert.rejects(vault.read('other-server',email),'AES additional data rejects cross-account/app substitution');
values.set(server,{...saved,password:saved.password.replace('ciphertext','broken')});await assert.rejects(vault.read(server,email));values.set(server,saved);
values.delete(server+'.biometric-key-v1');await assert.rejects(vault.read(server,email),/set up again/);await assert.rejects(vault.write(server,email,'downgrade'),/Unlock/);
await vault.clear(server);assert.equal(await vault.read(server,email),undefined);
await vault.write(server,email,raw);failEnvelope=true;await assert.rejects(vault.enable(server,email,raw));failEnvelope=false;await assert.rejects(vault.read(server,email),/interrupted/,'Partial enrollment cannot use legacy plaintext');await vault.clear(server);
available=false;await assert.rejects(vault.enable(server,email,raw),/not available/);
console.log('Native biometric vault passed: enrollment, encrypted storage, one prompt, refresh, relaunch, cancellation, account/app binding, tampering, invalidated key, interrupted setup and cleanup.');

// A late device approval must not repopulate unlock state after sign-out/locking.
available=true;await vault.enable(server,email,raw);vault.lock();
let release,started;
const waiting=new Promise(resolve=>{started=resolve});const originalSecure=native.getSecureCredentials;
native.getSecureCredentials=async options=>{started();await new Promise(resolve=>{release=resolve});return originalSecure(options)};
const pending=vault.read(server,email);await waiting;vault.lock();release();
await assert.rejects(pending,/locked/);await assert.rejects(vault.write(server,email,'late refresh'),/Unlock/);native.getSecureCredentials=originalSecure;
await vault.clear(server);
console.log('Late native approval cannot restore an unlocked session after sign-out.');
