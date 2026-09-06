import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const names=['HASHPAYSTREAM_UPLOAD_STORE_FILE','HASHPAYSTREAM_UPLOAD_STORE_PASSWORD','HASHPAYSTREAM_UPLOAD_KEY_ALIAS','HASHPAYSTREAM_UPLOAD_KEY_PASSWORD'];
const report={configurationReady:false,keystoreChecked:false,referenceApkChecked:false};
try{
 const missing=names.filter(name=>!process.env[name]);
 if(missing.length){console.log(JSON.stringify({...report,missing}));process.exitCode=2;}
 else{
  const javaHome=process.env.JAVA_HOME || 'C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot';
  const keytool=path.join(javaHome,'bin',process.platform==='win32'?'keytool.exe':'keytool');
  const java=path.join(javaHome,'bin',process.platform==='win32'?'java.exe':'java');
  const store=path.resolve('android/app',process.env.HASHPAYSTREAM_UPLOAD_STORE_FILE);
  if(!fs.existsSync(store)||!fs.statSync(store).isFile())throw Error('KEYSTORE_FILE_UNAVAILABLE');
  if(!fs.existsSync(keytool))throw Error('JDK_KEYTOOL_UNAVAILABLE');
  // Password values never appear in arguments or output. The key password is
  // validated by the actual release signing build, not by this certificate read.
  const listing=execFileSync(keytool,['-J-Duser.language=en','-list','-v','-keystore',store,'-alias',process.env.HASHPAYSTREAM_UPLOAD_KEY_ALIAS,'-storepass:env','HASHPAYSTREAM_UPLOAD_STORE_PASSWORD'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
  if(!listing.includes('PrivateKeyEntry'))throw Error('ALIAS_IS_NOT_A_PRIVATE_KEY');
  const fingerprint=listing.match(/SHA256:\s*([a-fA-F0-9:]+)/)?.[1]?.replaceAll(':','').toLowerCase();
  if(!fingerprint||fingerprint.length!==64)throw Error('CERTIFICATE_FINGERPRINT_UNAVAILABLE');
  report.configurationReady=true;report.keystoreChecked=true;report.signingCertificateSha256=fingerprint;
  const at=process.argv.indexOf('--reference-apk');
  if(at!==-1){
   const apk=process.argv[at+1];if(!apk||!fs.existsSync(apk))throw Error('REFERENCE_APK_UNAVAILABLE');
   const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||'C:/Users/USER/AppData/Local/Android/Sdk';
   const versions=fs.readdirSync(path.join(sdk,'build-tools')).filter(x=>/^\d+\.\d+\.\d+$/.test(x)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
   const jar=versions.map(v=>path.join(sdk,'build-tools',v,'lib','apksigner.jar')).find(p=>fs.existsSync(p));if(!jar)throw Error('APKSIGNER_UNAVAILABLE');
   const output=execFileSync(java,['-jar',jar,'verify','--print-certs',path.resolve(apk)],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
   const current=output.match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]+)/)?.[1]?.toLowerCase();if(!current)throw Error('REFERENCE_CERTIFICATE_UNAVAILABLE');
   report.referenceApkChecked=true;report.directCertificateMatch=current===fingerprint;
   if(!report.directCertificateMatch){report.next='Review the update/signing lineage; do not uninstall user data to bypass a mismatch.';process.exitCode=2;}
  }
  console.log(JSON.stringify(report));
 }
}catch(e){console.error(JSON.stringify({...report,error:/^[A-Z_]+$/.test(e.message)?e.message:'SIGNING_PREFLIGHT_FAILED'}));process.exitCode=1;}
