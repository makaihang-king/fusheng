#include "cocos/base/Macros.h"
#include "cocos/bindings/jswrapper/SeApi.h"

#if CC_PLATFORM == CC_PLATFORM_ANDROID

#include <cmath>
#include <cstdint>
#include <limits>
#include <string>

#include "cocos/platform/java/jni/JniHelper.h"

namespace {

constexpr size_t FRAME_BYTES = 480U * 270U * 4U;
constexpr char CODEC_CLASS[] = "com/cocos/game/MomentCodec";

bool validId(const std::string &id) {
    if (id.empty() || id.size() > 80U) {
        return false;
    }
    for (char ch : id) {
        const bool letter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
        const bool digit = ch >= '0' && ch <= '9';
        if (!letter && !digit && ch != '-' && ch != '_') {
            return false;
        }
    }
    return true;
}

bool enqueueRgba(se::State &state) {
    state.rval().setBoolean(false);
    const auto &args = state.args();
    if (args.size() != 3U || !args[0].isString() || !args[1].isObject() || !args[2].isNumber()) {
        return true;
    }

    const std::string id = args[0].toString();
    se::Object *pixels = args[1].toObject();
    const double pts = args[2].toDouble();
    if (!validId(id) || !pixels->isTypedArray() ||
        pixels->getTypedArrayType() != se::Object::TypedArrayType::UINT8 ||
        !std::isfinite(pts) || pts < 0.0 ||
        pts > static_cast<double>(std::numeric_limits<jlong>::max())) {
        return true;
    }

    uint8_t *rgba = nullptr;
    size_t length = 0;
    if (!pixels->getTypedArrayData(&rgba, &length) || rgba == nullptr || length != FRAME_BYTES) {
        return true;
    }

    cc::JniMethodInfo method{};
    if (!cc::JniHelper::getStaticMethodInfo(
            method, CODEC_CLASS, "enqueueRgba", "(Ljava/lang/String;[BJ)Z")) {
        return true;
    }

    JNIEnv *env = method.env;
    jstring javaId = env->NewStringUTF(id.c_str());
    jbyteArray javaPixels = env->NewByteArray(static_cast<jsize>(length));
    if (javaId != nullptr && javaPixels != nullptr && !env->ExceptionCheck()) {
        env->SetByteArrayRegion(javaPixels, 0, static_cast<jsize>(length),
                                reinterpret_cast<const jbyte *>(rgba));
        if (!env->ExceptionCheck()) {
            const jboolean accepted = env->CallStaticBooleanMethod(
                method.classID, method.methodID, javaId, javaPixels, static_cast<jlong>(pts));
            if (!env->ExceptionCheck()) {
                state.rval().setBoolean(accepted == JNI_TRUE);
            }
        }
    }
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    if (javaPixels != nullptr) {
        env->DeleteLocalRef(javaPixels);
    }
    if (javaId != nullptr) {
        env->DeleteLocalRef(javaId);
    }
    env->DeleteLocalRef(method.classID);
    return true;
}
SE_BIND_FUNC(enqueueRgba)

} // namespace

bool registerFleetingMomentNative(se::Object *global) {
    se::HandleObject bridge(se::Object::createPlainObject());
    return bridge->defineFunction("enqueueRgba", _SE(enqueueRgba)) &&
           global->setProperty("fleetingMomentNative", se::Value(bridge));
}

#endif // CC_PLATFORM == CC_PLATFORM_ANDROID
