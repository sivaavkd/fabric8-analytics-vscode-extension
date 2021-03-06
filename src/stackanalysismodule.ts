'use strict';

import * as vscode from 'vscode';

import { Apiendpoint } from './apiendpoint';
import { multimanifestmodule } from './multimanifestmodule';

export module stackanalysismodule {

    const request = require('request');
    let stack_analysis_requests = new Map<String, String>();
    let stack_analysis_responses = new Map<String, String>();
    let stack_collector_count = 0;

    export let stack_collector: any;
    export let get_stack_metadata: any;
    export let post_stack_analysis: any;
    export let clearContextInfo: any;

    stack_collector = (file_uri, id, OSIO_ACCESS_TOKEN, cb) => {
        const options = {};
        options['uri'] = `${Apiendpoint.STACK_API_URL}stack-analyses/${id}?user_key=${Apiendpoint.STACK_API_USER_KEY}`;
        options['headers'] = {'Authorization': 'Bearer ' + OSIO_ACCESS_TOKEN};
        request.get(options, (err, httpResponse, body) => {
            stack_collector_count++;
            if(err){
                cb(null);
            } else {
                if (httpResponse.statusCode === 200 || httpResponse.statusCode === 202) {
                    let data = JSON.parse(body);
                    if (!data.hasOwnProperty('error')) {
                        stack_analysis_responses.set(file_uri, data);
                        cb(data);
                    }
                    else {
                        if (httpResponse.statusCode === 200 || httpResponse.statusCode === 202) {
                            //vscode.window.showInformationMessage('Analysis in progress ...');
                            if(stack_collector_count <= 10){
                                setTimeout(() => { stack_collector(file_uri, id, OSIO_ACCESS_TOKEN, cb); }, 6000);
                            } else{
                                vscode.window.showErrorMessage(`Unable to get stack analyzed, try again`);
                                cb(null);
                            }
                        }
                    }
                } else if(httpResponse.statusCode === 403){
                    vscode.window.showInformationMessage(`Service is currently busy to process your request for analysis, please try again in few minutes. Status:  ${httpResponse.statusCode} `);
                    cb(null);
                } else {
                    vscode.window.showErrorMessage(`Failed to get stack analyzed, Status:  ${httpResponse.statusCode} `);
                    cb(null);
                }
            }

        });
	};

	get_stack_metadata = (context, file_uri, contextData, provider, OSIO_ACCESS_TOKEN, cb) => {

        let payloadData : any;
        let projRootPath: string = vscode.workspace.rootPath;
        if(projRootPath){
            let encodedProjRootPath: any = projRootPath.replace(/ /g,'%20');
            let projRootPathSplit: any = encodedProjRootPath.split('/');
            let projName: string = projRootPathSplit[projRootPathSplit.length-1].toLowerCase();
            let filePathList = file_uri.split(projName+'/');

            vscode.workspace.findFiles(`{${filePathList[1]},LICENSE}`).then(
                (result: vscode.Uri[]) => {
                    if(result && result.length){
                        multimanifestmodule.form_manifests_payload(result, (data) => {
                            if(data){
                                payloadData = data;
                                const options = {};
                                let thatContext: any;
                                let file_uri: string;
                                options['uri'] = `${Apiendpoint.STACK_API_URL}stack-analyses/?user_key=${Apiendpoint.STACK_API_USER_KEY}`;
                                options['headers'] = {'Authorization': 'Bearer ' + OSIO_ACCESS_TOKEN};
                                options['formData'] = payloadData;
                                thatContext = context;
                                post_stack_analysis(options,file_uri, OSIO_ACCESS_TOKEN,thatContext, cb);
        
                        } else {
                            vscode.window.showErrorMessage(`Failed to trigger stack analysis`);
                            cb(null);
                        }
                    
                    });
                    } else {
                        vscode.window.showErrorMessage('No manifest file found to be analyzed');
                        cb(null);
                    }
                    
                },
                // rejected
                (reason: any) => {
                    vscode.window.showErrorMessage(reason);
                    cb(null);
                });
        } else {
            vscode.window.showErrorMessage('Please reopen the Project, unable to get workspace details');
        }
	};


    post_stack_analysis = (options,file_uri, OSIO_ACCESS_TOKEN,thatContext, cb) => {
        console.log('Options', options && options.formData);
        request.post(options, (err, httpResponse, body) => {
            if(err){
                clearContextInfo(thatContext);
                console.log('error', err);
                cb(null);
            }else {
                console.log('response Post '+body);
                if ((httpResponse.statusCode === 200 || httpResponse.statusCode === 202)) {
                    let resp = JSON.parse(body);
                    if (resp.error === undefined && resp.status === 'success') {
                        stack_analysis_requests[file_uri] = resp.id;
                        console.log(`Analyzing your stack, id ${resp.id}`);
                        stack_collector_count = 0;
                        setTimeout(() => { stack_collector(file_uri, resp.id, OSIO_ACCESS_TOKEN, cb); }, 6000);
                    } else {
                        vscode.window.showErrorMessage(`Failed :: ${resp.error }, Status: ${httpResponse.statusCode}`);
                        cb(null);
                    }
                } else if(httpResponse.statusCode === 401){
                    clearContextInfo(thatContext);
                    vscode.window.showErrorMessage(`Looks like your token is not proper, kindly re authorize with OpenShift.io`);
                    cb(null);
                } else if(httpResponse.statusCode === 429 || httpResponse.statusCode === 403){
                    vscode.window.showInformationMessage(`Service is currently busy to process your request for analysis, please try again in few minutes. Status:  ${httpResponse.statusCode} `);
                    cb(null);
                } else if(httpResponse.statusCode === 400){
                    vscode.window.showInformationMessage(`Manifest file(s) are not proper. Status:  ${httpResponse.statusCode} `);
                    cb(null);
                } else {   
                    vscode.window.showErrorMessage(`Failed to trigger stack analysis, try in a while. Status: ${httpResponse.statusCode}`);
                    cb(null);
                }
            }

        });
    };

    clearContextInfo = (context) => {
        context.globalState.update('f8_access_token', '');
        context.globalState.update('f8_refresh_token', '');
        context.globalState.update('f8_3scale_user_key', '');
        context.globalState.update('f8_access_routes', '');
    };

}
