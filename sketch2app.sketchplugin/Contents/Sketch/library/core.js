@import 'library/common.js'
@import 'library/analytics.js'

const appchef = {
  "defs": {
    "pluginVersion": "Version 0.5.0",
    "apiBase": "https://cloud.appchef.io/",
    "apiSignin": "login",
    "apiUpload": "sketch",
    "apiCheck": "check",
    "apiLog": "log",
    "localFolder": "appchef",
    "factors": [
      {
        "scale": 2.0,
        "suffix": "@2x",
      }
    ]
  },

  getSavedValueFromKey: function(key){
    return [[NSUserDefaults standardUserDefaults] objectForKey:key]
  },

  saveValueForKey: function(value, key){
    [[NSUserDefaults standardUserDefaults] setObject:value forKey:key]
    [[NSUserDefaults standardUserDefaults] synchronize]
  },

  showMessage: function(message, context){
    var document = context.document
    document.showMessage(message)
  },

  showAlert: function(message, context){
    var alert = NSAlert.alloc().init()
    alert.setMessageText(message)
    alert.addButtonWithTitle("OK")
    alert.runModal()
  },

  tokenValid: function(context) {
    var idToken = appchef.getSavedValueFromKey("idToken")
    log("get saved token " + idToken)
    if (!idToken) return false
    var token = "Bearer " + idToken
    var url = [NSURL URLWithString:appchef.defs.apiBase + appchef.defs.apiCheck]
    var request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringCacheData timeoutInterval:60]
    [request setHTTPMethod:"GET"]
    [request setValue:"sketch" forHTTPHeaderField:"User-Agent"]
    [request setValue:"application/json" forHTTPHeaderField:"Content-Type"]
    [request setValue:token forHTTPHeaderField:"Authorization"]

    var response = MOPointer.alloc().init()
    var error = MOPointer.alloc().init()
    var data = [NSURLConnection sendSynchronousRequest:request returningResponse:response error:error]
    if (error.value() == nil && data != nil){
      var res = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableLeaves error:nil]
      if (res.message == "success") return true
      else return false
    } else {
      appchef.showAlert("😞 User session expired. Please login again.", context)
      return false
    }
  },

  showUploadDialog: function(context) {
    var accessoryView = NSView.alloc().initWithFrame(NSMakeRect(0.0, 0.0, 260.0, 50.0))
    var alert = NSAlert.alloc().init()
    alert.addButtonWithTitle("Upload")
    alert.addButtonWithTitle("Cancel")
    alert.setAccessoryView(accessoryView)
    alert.setMessageText("Click Upload to start. Upload will take some time. After complete, you will see success message in a new modal dialog.")
    var responseCode = alert.runModal()
    return responseCode
  },

  showLoginDialog: function(context){
    var accessoryView = NSView.alloc().initWithFrame(NSMakeRect(0.0, 0.0, 260.0, 50.0))

    var emailInputField = NSTextField.alloc().initWithFrame(NSMakeRect(0.0, 30.0, 260.0, 20.0))
    emailInputField.cell().setPlaceholderString("Email")
    accessoryView.addSubview(emailInputField)

    var passwordInputField = NSSecureTextField.alloc().initWithFrame(NSMakeRect(0.0, 0.0, 260.0, 20.0))
    passwordInputField.cell().setPlaceholderString("Password")
    accessoryView.addSubview(passwordInputField)

    var alert = NSAlert.alloc().init()
    alert.addButtonWithTitle("Login")
    alert.addButtonWithTitle("Cancel")
    alert.setAccessoryView(accessoryView)
    alert.setMessageText("Login and Upload. Upload will take some time. After complete, you will see success message in the dialog.")

    [[alert window] setInitialFirstResponder:emailInputField]
    [emailInputField setNextKeyView:passwordInputField]

    var responseCode = alert.runModal()
    return [responseCode, emailInputField.stringValue(), passwordInputField.stringValue()]
  },

  loginWithEmailAndPassword: function(context, email, password){
    var url = [NSURL URLWithString:appchef.defs.apiBase + appchef.defs.apiSignin]
    var request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringCacheData timeoutInterval:60]
    [request setHTTPMethod:"POST"]
    [request setValue:"sketch" forHTTPHeaderField:"User-Agent"]
    [request setValue:"application/json" forHTTPHeaderField:"Content-Type"]

    var parameter = {"username": email, "password": password}
    var postData = [NSJSONSerialization dataWithJSONObject:parameter options:0 error:nil]
    [request setHTTPBody:postData]

    var response = MOPointer.alloc().init()
    var error = MOPointer.alloc().init()
    var data = [NSURLConnection sendSynchronousRequest:request returningResponse:response error:error]
    if (error.value() == nil && data != nil){
      var res = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableLeaves error:nil]
      appchef.saveValueForKey(res.id_token, "idToken")
      appchef.saveValueForKey(res.user_id, "userId")
      ga.send(context, {ec: 'login', ea: 'login', el: email, ev: 1, uid: res.user_id})
      return true
    } else {
      ga.send(context, {exd: 'LoginError-'+email, exf: 0, uid: res.user_id, el: email, ev: 1})
      return error.value()
    }
  },

  loginToExport: function(context) {
    var response = appchef.showLoginDialog(context)
    if (response[0] == 1000) {
      var response = appchef.loginWithEmailAndPassword(context, response[1], response[2])
      appchef.showMessage("Login Success. Generating Schema ...", context)
      if (response == 1) {
        appchef.exportSchema(context)
      } else {
        appchef.showAlert("Login failed. Please check your credentials and try again", context)
      }
    }
  },

  exportWithoutLogin: function(context) {
    var response = appchef.showUploadDialog(context)
    if (response == 1000) appchef.exportSchema(context)
  },

  exportSchema: function(context) {
    var uid = appchef.getSavedValueFromKey("userId")
    var document = context.document
    var baseDir = helpers.getCurrentDirectory(document)
    var filename = document.fileURL().lastPathComponent()
    var logging = filename + ", "
    helpers.removeFileOrFolder(baseDir + "/" + appchef.defs.localFolder)
    helpers.removeFileOrFolder(baseDir + "/" + appchef.defs.localFolder + "-schema.zip")
    helpers.removeFileOrFolder(baseDir + "/" + appchef.defs.localFolder + "-assets.zip")
    helpers.createFolderAtPath(baseDir + "/" + appchef.defs.localFolder)
    appchef.logger(context, "debug", logging + "create local appchef folder " + appchef.defs.localFolder)
    try {
      helpers.exec(document, "/Applications/Sketch.app/Contents/Resources/sketchtool/bin/sketchtool dump \"" + filename + "\" > " + appchef.defs.localFolder + "/raw.json")
      appchef.logger(context, "debug", logging + "generated sketch json schema")
    } catch (err) {
      ga.send(context, {exd: 'SketchToolDumpError', uid: uid, el: uid, ev: 1})
      appchef.showAlert("Use sketchtool failed. Please install Homebrew and try install sketchtool again.", context)
      appchef.logger(context, "error", logging + "fail to call sketchtool dump. Error is " + JSON.stringify(err))
    }
    try {
      helpers.exec(document, "zip -r -X " + appchef.defs.localFolder + "-schema.zip " + appchef.defs.localFolder)
    } catch (err) {
      ga.send(context, {exd: 'CompressError', uid: uid, el: uid, ev: 1})
      appchef.showAlert("Compress schema folder " + appchef.defs.localFolder + " failed. Please contact us to fix the problem.", context)
      appchef.logger(context, "error", logging + "fail to compress appchef schema folder. Error is " + JSON.stringify(err))
    }
    appchef.upload(baseDir + "/" + appchef.defs.localFolder + "-schema.zip", filename, 'schema', context)
  },

  exportAssets: function(context) {
    helpers.createFolderAtPath(baseDir + "/" + appchef.defs.localFolder + "/images")
    var uid = appchef.getSavedValueFromKey("userId")
    var document = context.document
    var selection = document.allExportableLayers()
    var baseDir = helpers.getCurrentDirectory(document)
    var filename = document.fileURL().lastPathComponent()
    var logging = filename + ", "
    for (var i = 0; i < [selection count]; i++) {
      var layer = selection[i]
      appchef.processSlice(layer, document)
    }
    appchef.logger(context, "debug", logging + "exported all assets from sketch")
    try {
      helpers.exec(document, "zip -r -X " + appchef.defs.localFolder + "-assets.zip " + appchef.defs.localFolder + "/images")
    } catch (err) {
      appchef.showAlert("Compress assets directory " + appchef.defs.localFolder + "/images faild. Please contact us to fix the problem.", context)
      appchef.logger(context, "error", logging + "fail to compress appchef assets folder. Error is " + JSON.stringify(err))
    }
    appchef.upload(baseDir + "/" + appchef.defs.localFolder + "-assets.zip", filename, 'assets', context)
  },

  processSlice: function(slice, document) {
    var frame = [slice frame]
    var objectID = [slice objectID]
    var sliceName = ([slice name]).replace(/[^A-Za-z0-9._-]/g, '-')
    var baseDir = helpers.getCurrentDirectory(document)

    for (var i = 0; i < appchef.defs.factors.length; i++) {
      var scale = appchef.defs.factors[i].scale
      var suffix = appchef.defs.factors[i].suffix
      var version = appchef.makeSliceAndResizeWithFactor(slice, scale)
      var fileName = baseDir + "/" + appchef.defs.localFolder + "/images/" + sliceName + "-" + objectID + suffix + ".png"
      [document saveArtboardOrSlice: version toFile: fileName]
      log("Saved " + fileName)
    }
  },

  makeSliceAndResizeWithFactor: function(layer, scale) {
    var loopLayerChildren = [[layer children] objectEnumerator]
    var sliceLayerAncestry = [MSImmutableLayerAncestry ancestryWithMSLayer:layer]
    var rect = [MSSliceTrimming trimmedRectForLayerAncestry:sliceLayerAncestry]
    var useSliceLayer = false

    // Check for MSSliceLayer and overwrite the rect if present
    while (layerChild = [loopLayerChildren nextObject]) {
      if ([layerChild class] == 'MSSliceLayer') {
        sliceLayerAncestry = [MSImmutableLayerAncestry ancestryWithMSLayer:layerChild]
        rect = [MSSliceTrimming trimmedRectForLayerAncestry:sliceLayerAncestry]
        useSliceLayer = true
      }
    }

    var slices = [MSExportRequest exportRequestsFromExportableLayer:layer inRect:rect useIDForName:false]
    var slice = null
    if (slices.count() > 0) {
      slice = slices[0]
      slice.scale = scale
    }

    if (!useSliceLayer) {
      slice.shouldTrim = true
    }
    return slice
  },

  upload: function(filePath, project, type, context) {
    var uid = appchef.getSavedValueFromKey("userId")
    var token = appchef.getSavedValueFromKey("idToken")
    var task = NSTask.alloc().init()
    var logging = project + ", "
    task.setLaunchPath("/usr/bin/curl")
    var args = NSArray.arrayWithArray(["-X", "POST", "-H", "Authorization: Bearer " + token, "-F", "project=" + project, "-F", "type=" + type, "-F", "assets=@" + filePath, appchef.defs.apiBase + appchef.defs.apiUpload])
    task.setArguments(args)
    var outputPipe = [NSPipe pipe]
    [task setStandardOutput:outputPipe]
    task.launch()
    var outputData = [[outputPipe fileHandleForReading] readDataToEndOfFile]
    var outputString = [[[NSString alloc] initWithData:outputData encoding:NSUTF8StringEncoding]]
    var outputArray = [NSJSONSerialization JSONObjectWithData:outputData options:NSJSONReadingAllowFragments error:nil]
    log(outputString)
    if(outputArray["message"] != "success"){
      ga.send(context, {exd: 'UploadError', exf: 1, uid: uid, el: uid, ev: 1})
      appchef.logger(context, "error", logging + "fail to upload " + type + ". Error is " + outputArray["message"])
      appchef.showAlert(outputArray["message"], context)
    } else {
      appchef.logger(context, "debug", logging + "success upload " + type)
      if (type === 'schema') {
        appchef.showMessage("Sketch schema upload success. Now uploading image assets, upload time depends on the size of assets. Please wait and don't close sketch ...", context)
        appchef.exportAssets(context)
      } else {
        ga.send(context, {ec: 'upload', ea: 'upload', uid: uid, el: uid, ev: 1})
        appchef.showAlert("👍 Upload success. Open the Appchef app on your phone to see the project.", context)
      }
    }
  },

  logger: function(context, level, message){
    log('send message ' + level + ' ' + message);
    var url = [NSURL URLWithString:appchef.defs.apiBase + appchef.defs.apiLog]
    var token = "Bearer "+appchef.getSavedValueFromKey("idToken")
    var request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringCacheData timeoutInterval:60]
    [request setHTTPMethod:"POST"]
    [request setValue:"sketch" forHTTPHeaderField:"User-Agent"]
    [request setValue:"application/json" forHTTPHeaderField:"Content-Type"]
    [request setValue:token forHTTPHeaderField:"Authorization"]

    var parameter = {"message": message, "level": level};
    var postData = [NSJSONSerialization dataWithJSONObject:parameter options:0 error:nil]
    [request setHTTPBody:postData]
    [NSURLConnection sendSynchronousRequest:request returningResponse:nil error:nil]
  },

  installSketchtool: function(context) {
    var uid = appchef.getSavedValueFromKey("userId")
    try {
      var res = helpers.exec(context.document, "/Applications/Sketch.app/Contents/Resources/sketchtool/install.sh")
      ga.send(context, {ec: 'install-sketchtool', ea: 'install-sketchtool', uid: uid, el: uid, ev: 1})
      appchef.showAlert(res, context)
    } catch (error) {
      ga.send(context, {exd: 'InstallSketchToolError', exf: 1, uid: uid, el: uid, ev: 1})
      log("receive error " + error)
      appchef.logger(context, "error", "Fail to install sketchtool. Error is " + JSON.stringify(error))
      appchef.showAlert("Install sketchtool failed. Please install Homebrew and try again.", context)
    }
  },

  logoutFromSketch: function(context){
    var uid = appchef.getSavedValueFromKey("userId")
    ga.send(context, {ec: 'logout', ea: 'logout', uid: uid, el: uid, ev: 1})
    appchef.saveValueForKey(nil, "idToken")
    appchef.saveValueForKey(nil, "userId")
    appchef.saveValueForKey(nil, "currentVersion")
    appchef.showMessage("Logout success", context)
  },

}
