import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Optional release keystore. Set these in ~/.gradle/gradle.properties (never
// committed): YTC_KEYSTORE, YTC_KEYSTORE_PASSWORD, YTC_KEY_ALIAS, YTC_KEY_PASSWORD.
// If absent, the release build falls back to the debug key so a local sideload
// still works — just keep the same key for upgrades to install over each other.
val keystorePath = (project.findProperty("YTC_KEYSTORE") as String?)?.takeIf { it.isNotBlank() }

android {
    namespace = "com.ytc.entry"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ytc.entry"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // Default dashboard URL; editable on the login screen so a domain change
        // needs no rebuild.
        buildConfigField(
            "String",
            "DEFAULT_BASE_URL",
            "\"https://access.ytchaim.com\"",
        )
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = project.findProperty("YTC_KEYSTORE_PASSWORD") as String?
                keyAlias = project.findProperty("YTC_KEY_ALIAS") as String?
                keyPassword = project.findProperty("YTC_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.cio)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.kotlinx.serialization.json)
    debugImplementation(libs.androidx.ui.tooling)
}
