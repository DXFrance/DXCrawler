#Sites-Scanner website

There are two major components:

1. **Scan API endpoint**: scans one URL and returns the results.
2. **Webjob**: takes batches of websites from a list and sends requests to the Scan API endpoint.

##Scan API endpoint

The core functionality of the sites-scanner sites is the **scan** endpoint which is mainly a ported version of the [modern.ie static code scan repository](https://github.com/InternetExplorer/modern.IE-static-code-scan/).

The original endpoint URL was changed to `/api/v2/scan` in order to be able to test multiple version of the scanner.

To try it locally:
	- Clone the repo
	- npm install
	- node app.js
	- Open your browser and navigate to "http://localhost:1337/api/v2/scan?url=http://www.bing.com"

### Example

A `GET` request issued to `http://sites-scanner.azurewebsites.net/api/v2/scan?url=http://www.microsoft.com/` returns a JSON response containing the scan results of `microsoft.com`.

    {
		"url": {
			"uri": "http://microsoft.com"
		},
		"processTime": 9.793,
		"results": {
			"browserDetection": {...},
			"browserbite": {...},
			"cssprefixes": {...},
			"edge": {...},
			"inputTypes": {...},
			"jslibs": {...},
			"pluginfree": {...}
		}
	}

##Webjob

The webjob takes batches of websites from a pre-configured list and sends requests to the Scan API endpoint. It collects results and errors and stores them in two files prefixed with `results` and `errors`.
In order to obtain early feedback, the process dumps the results after 1000 checks and the errors after every 100 error messages.

###<a name="parameters"></a>Parameters

The webjob can be parameterized from the command line or by reading the `ScanJob_Arguments` App Setting (configurable from the Azure Website portal).

 * `--source=<source>`: If the value is  `azure` it will use Azure storage and read the list of websites from the _websites.csv_ blob file. For any other value it will use the file system. (Default value: _azure_)
 * `--target=<target>`:  If the value is  `azure` it will store the results and errors in Azure blob storage. For any other value it will use the file system. (Default value: _azure_)
 * `--file=<filename>`: Used to set the input file name. (Default value: `websites.csv`) Depending on `source`, the name refers to local file system or to Azure storage.
 * `--prefix=<urlprefix>`: Used to set the Scan API endpoint URL to use. We used it for development and testing purposes and can be used to redirect the load to any other environment. We now defaulted to the _production_ environment: `http://sites-scanner.azurewebsites.net/api/v2/scan?url=http://`
 * `--connections=<noconnections>`: Used to set the amount of simultaneous connection the webjob can execute to the Scan API. We found this useful while improving the scalability of the solution. (Default value: 20 connections).
 * `--simulation`: Flag that reads the test results from a file `results.json` stored in the webjob's folder. This file must be pre populated with the results of a scan.

##Websites and Results pages

We removed the original feature to enter and scan a single URL. We replaced it with the ability to upload a website list in CSV format that will be displayed  and another page to view the results.

##Deployment

Deployment can be done in three different ways:

 * Repository integration - You can upload the entire repository to the Azure website repository.
 * Deployment script - You can drop your publish setting file, rename it to `sites-scanner.PublishSettings` and run the ´deploy.cmd´ script. This script uses the [WAWSDeploy](https://github.com/davidebbo/WAWSDeploy) tool to upload all required files using WebDeploy.
 * Manually - Upload the entire repository to the remote site's `\wwwroot\` folder via FTP.

###App Settings

Three app settings are used by the website and the webjob:

- `Storage_AccountName`: the name of the storage account where the results are stored.
- `Storage_AccessKey`: the access key to the storage account where the results are stored.
- `ScanJob_Arguments`: list of arguments to the webjob, as described in the WebJob's [Parameters](#parameters) section above.

The file **config.js** in the **/lib/checks** folder specifies default values for the following parameters:

- `Storage_AccountName`: `sitesscannerdev`
- `Storage_AccessKey`
- Storage container name: `dailyscan`
- User Agent string: `Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36 Edge/12.0`
- Scan API URL prefix: `http://sites-scanner.azurewebsites.net/api/v2/scan?url=http://`
- URL of the Compatibility Lists: `http://cvlist.ie.microsoft.com/0315000/1426178821/iecompatviewlist.xml`

##Configurable Checks
###CSS Prefixes

The file `lib\checks\whitelisted-properties.json`:

```json
{
    "whitelist": [ ],
    "whitelist_microsoft.com": [
        "animation",
        "animation-duration",
        "appearance",
        "box-sizing",
        "text-size-adjust",
        "transition"
    ]
}
```

If you modify this file, you should restart the service to take the changes into account.


###Plugin free

The file `lib\checks\check-pluginfree.json`:

```json
{
    "allowFlash": true,
    "allowSilverlight": true,
    "allowOthers": false
}
```

If you modify this file, you should restart the service to take the changes into account.
