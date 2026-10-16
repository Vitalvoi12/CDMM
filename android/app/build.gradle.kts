plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "ru.vitalvoi.cdmm"
    compileSdk = 37
    defaultConfig {
        applicationId = "ru.vitalvoi.cdmm"
        minSdk = 26
        targetSdk = 36
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1"
    }
    signingConfigs {
        // CI passes the release key in env; local builds fall back to debug signing.
        System.getenv("CDMM_KEYSTORE")?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = System.getenv("CDMM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CDMM_KEY_ALIAS") ?: "cdmm"
                keyPassword = System.getenv("CDMM_KEY_PASSWORD") ?: System.getenv("CDMM_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.activity)
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)
}
