package com.civilworkforce.attendance

import android.app.Application
import com.civilworkforce.attendance.di.AppContainer
import com.civilworkforce.attendance.di.DefaultAppContainer
import com.google.firebase.FirebaseApp

class CivilWorkforceApp : Application() {

    lateinit var container: AppContainer

    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
        container = DefaultAppContainer(this)
    }
}
