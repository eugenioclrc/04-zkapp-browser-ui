import '../styles/globals.css'
import { useEffect, useState } from "react";
import './reactCOIServiceWorker';
import ZkappWorkerClient from './zkappWorkerClient';
import {
  PublicKey,
  PrivateKey,
  Field,
} from 'snarkyjs'
let transactionFee = 0.1;

let logLines:String[] = [];

function log(t:String) {
  console.log(t);
  logLines.push(String(t));
  logLines = [...logLines, String(t)].slice(-8);
}

export default function App() {

  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  });


  // -------------------------------------------------------
  // Do Setup
  useEffect(() => {
    (async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient();
        log('Loading SnarkyJS...');
        logLines.push('Loading SnarkyJS...');
        await zkappWorkerClient.loadSnarkyJS();
        log('done');
        logLines.push('done');
        await zkappWorkerClient.setActiveInstanceToBerkeley();
        const mina = (window as any).mina;
        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }
        const publicKeyBase58 : string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);
        log('using key', publicKey.toBase58());
        logLines.push('using key', publicKey.toBase58());
        log('checking if account exists...');
        logLines.push('checking if account exists...');
        const res = await zkappWorkerClient.fetchAccount({ publicKey: publicKey! });
        
        const accountExists = res.error == null;
        await zkappWorkerClient.loadContract();
        log('compiling zkApp');
        logLines.push('compiling zkApp');
        await zkappWorkerClient.compileContract();
        log('zkApp compiled');
        logLines.push('zkApp compiled');
        const zkappPublicKey = PublicKey.fromBase58('B62qjWyntdizupF44kn1ZfRB6d7kn43ftqsWoW9nddemg3LcUcknTsr');
        await zkappWorkerClient.initZkappInstance(zkappPublicKey);
        log('getting zkApp state...');
        logLines.push('getting zkApp state...');
        await zkappWorkerClient.fetchAccount({ publicKey: zkappPublicKey })
        const currentNum = await zkappWorkerClient.getNum();
        
        log('current state:', currentNum.toString());
        logLines.push('current state:', currentNum.toString());
        setState({
            ...state,
            zkappWorkerClient, 
            hasWallet: true,
            hasBeenSetup: true, 
            publicKey, 
            zkappPublicKey, 
            accountExists, 
            currentNum
        });
      }
    })();
  }, []);
  
  // -------------------------------------------------------
  // Wait for account to exist, if it didn't
  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (;;) {
          log('checking if account exists...');
          const res = await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! })
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })();
  }, [state.hasBeenSetup]);
  // -------------------------------------------------------

  // -------------------------------------------------------
  // Send a transaction
  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });
    log('sending a transaction...');
    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! });
    await state.zkappWorkerClient!.createUpdateTransaction();
    log('creating proof...');
    await state.zkappWorkerClient!.proveUpdateTransaction();
    log('getting Transaction JSON...');
    const transactionJSON = await state.zkappWorkerClient!.getTransactionJSON()
    log('requesting send transaction...');
    const { hash } = await (window as any).mina.sendTransaction({
      transaction: transactionJSON,
      feePayer: {
        fee: transactionFee,
        memo: '',
      },
    });
    log(
      'See transaction at https://berkeley.minaexplorer.com/transaction/' + hash
    );
    setState({ ...state, creatingTransaction: false });
  }
  // -------------------------------------------------------

  // -------------------------------------------------------
  // Refresh the current state
  const onRefreshCurrentNum = async () => {
    log('getting zkApp state...');
    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.zkappPublicKey! })
    const currentNum = await state.zkappWorkerClient!.getNum();
    log('current state:', currentNum.toString());
    setState({ ...state, currentNum });
  }
  // -------------------------------------------------------...


  // -------------------------------------------------------
  // Create UI elements
  let hasWallet;
  if (state.hasWallet != null && !state.hasWallet) {
    const auroLink = 'https://www.aurowallet.com/';
    const auroLinkElem = <a href={auroLink} target="_blank" rel="noreferrer"> [Link] </a>
    hasWallet = <div> Could not find a wallet. Install Auro wallet here: { auroLinkElem }</div>
  }
  let setupText = state.hasBeenSetup ? 'SnarkyJS Ready' : 'Setting up SnarkyJS...';
  let setup = <div> { setupText } { hasWallet }</div>
  let accountDoesNotExist;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink = "https://faucet.minaprotocol.com/?address=" + state.publicKey!.toBase58();
    accountDoesNotExist = <div>
      Account does not exist. Please visit the faucet to fund this account
      <a href={faucetLink} target="_blank" rel="noreferrer"> [Link] </a>
    </div>
  }
  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = <div>
      <button onClick={onSendTransaction} disabled={state.creatingTransaction}> Send Transaction </button>
      <div> Current Number in zkApp: { state.currentNum!.toString() } </div>
      <button onClick={onRefreshCurrentNum}> Get Latest State </button>
    </div>
  }
  return <div className="main">
   { setup }
   { accountDoesNotExist }
   { mainContent }
   <hr />
   <h3>Logs</h3>

   <pre>
    Please check console tab in browser dev tools
    { logLines.map((e, i) => <div key={i}>{e}</div>) }
    </pre>
  </div>
}